import { z } from "zod";
import { messagesJson } from "@/lib/messages/http";
import { coerceMessageId } from "@/lib/messages/access";
import { MessageInboxResponseSchema, type MessageThreadSummary } from "@/lib/messages/types";
import { loadParentLinkedStudentContext } from "@/lib/parent/messages-access";

type Params = { params: { id: string } | Promise<{ id: string }> };

type ThreadRow = {
  id: string;
  kind: "student_coach";
  workspace_org_id: string;
  student_id: string;
  participant_a_id: string;
  participant_b_id: string;
  last_message_id: number | string | null;
  last_message_at: string | null;
  frozen_at: string | null;
  frozen_by: string | null;
  frozen_reason: string | null;
};

type ThreadMemberRow = {
  thread_id: string;
  user_id: string;
  last_read_message_id: number | string | null;
  last_read_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type MessageRow = {
  id: number | string;
  sender_user_id: string;
  body: string;
};

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const resolveStudentId = async (params: Params["params"]) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return null;
  return parsed.data.id;
};

export async function GET(request: Request, { params }: Params) {
  const studentId = await resolveStudentId(params);
  if (!studentId) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const { context, response } = await loadParentLinkedStudentContext(request, studentId);
  if (response || !context) return response;

  const { data: threadData, error: threadError } = await context.admin
    .from("message_threads")
    .select(
      "id, kind, workspace_org_id, student_id, participant_a_id, participant_b_id, last_message_id, last_message_at, frozen_at, frozen_by, frozen_reason"
    )
    .eq("student_id", context.studentId)
    .eq("kind", "student_coach")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (threadError) {
    return messagesJson({ error: "Chargement des conversations impossible." }, { status: 400 });
  }

  const threads = ((threadData ?? []) as ThreadRow[]).filter(
    (thread) => thread.kind === "student_coach" && thread.student_id === context.studentId
  );
  if (threads.length === 0) {
    return messagesJson({ threads: [], unreadMessagesCount: 0 });
  }

  const threadIds = threads.map((thread) => thread.id);
  const participantIds = Array.from(
    new Set(threads.flatMap((thread) => [thread.participant_a_id, thread.participant_b_id]))
  );
  const lastMessageIds = Array.from(
    new Set(
      threads
        .map((thread) => coerceMessageId(thread.last_message_id))
        .filter((messageId): messageId is number => messageId !== null)
    )
  );

  const [profileResult, lastMessageResult, threadMembersResult] = await Promise.all([
    context.admin
      .from("profiles")
      .select("id, full_name")
      .in("id", participantIds),
    lastMessageIds.length > 0
      ? context.admin
          .from("message_messages")
          .select("id, sender_user_id, body")
          .in("id", lastMessageIds)
      : Promise.resolve({ data: [], error: null }),
    context.admin
      .from("message_thread_members")
      .select("thread_id, user_id, last_read_message_id, last_read_at")
      .in("thread_id", threadIds),
  ]);

  if (profileResult.error || lastMessageResult.error || threadMembersResult.error) {
    return messagesJson({ error: "Chargement des conversations impossible." }, { status: 400 });
  }

  const profileMap = new Map<string, ProfileRow>();
  ((profileResult.data ?? []) as ProfileRow[]).forEach((profile) => {
    profileMap.set(profile.id, profile);
  });

  const messageMap = new Map<number, MessageRow>();
  ((lastMessageResult.data ?? []) as MessageRow[]).forEach((message) => {
    const messageId = coerceMessageId(message.id);
    if (!messageId) return;
    messageMap.set(messageId, message);
  });

  const membersByThread = new Map<string, ThreadMemberRow[]>();
  ((threadMembersResult.data ?? []) as ThreadMemberRow[]).forEach((member) => {
    const existing = membersByThread.get(member.thread_id) ?? [];
    existing.push(member);
    membersByThread.set(member.thread_id, existing);
  });

  const summaries: MessageThreadSummary[] = threads.map((thread) => {
    const lastMessageId = coerceMessageId(thread.last_message_id);
    const lastMessage = lastMessageId ? messageMap.get(lastMessageId) ?? null : null;
    const counterpartUserId = context.studentUserId
      ? thread.participant_a_id === context.studentUserId
        ? thread.participant_b_id
        : thread.participant_a_id
      : null;

    const threadMembers = membersByThread.get(thread.id) ?? [];
    const counterpartMember = counterpartUserId
      ? threadMembers.find((member) => member.user_id === counterpartUserId) ?? null
      : null;

    return {
      threadId: thread.id,
      kind: thread.kind,
      workspaceOrgId: thread.workspace_org_id,
      studentId: thread.student_id,
      studentName: context.studentName,
      groupId: null,
      groupName: null,
      participantAId: thread.participant_a_id,
      participantAName: profileMap.get(thread.participant_a_id)?.full_name ?? null,
      participantBId: thread.participant_b_id,
      participantBName: profileMap.get(thread.participant_b_id)?.full_name ?? null,
      counterpartUserId,
      counterpartName: counterpartUserId
        ? profileMap.get(counterpartUserId)?.full_name ?? null
        : null,
      lastMessageId,
      lastMessageAt: thread.last_message_at,
      lastMessagePreview: lastMessage?.body ?? null,
      lastMessageSenderUserId: lastMessage?.sender_user_id ?? null,
      unread: false,
      unreadCount: 0,
      ownLastReadMessageId: null,
      ownLastReadAt: null,
      counterpartLastReadMessageId: coerceMessageId(
        counterpartMember?.last_read_message_id ?? null
      ),
      counterpartLastReadAt: counterpartMember?.last_read_at ?? null,
      frozenAt: thread.frozen_at,
      frozenByUserId: thread.frozen_by,
      frozenReason: thread.frozen_reason,
    };
  });

  const parsed = MessageInboxResponseSchema.safeParse({
    threads: summaries,
    unreadMessagesCount: 0,
  });

  if (!parsed.success) {
    return messagesJson({ error: "Reponse messagerie invalide." }, { status: 500 });
  }

  return messagesJson(parsed.data);
}
