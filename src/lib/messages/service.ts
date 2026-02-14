import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  coerceMessageId,
  isCoachLikeActiveOrgMember,
  isStudentLinkedToOrganization,
  isUserInOrgGroup,
  loadUserEmailsByIds,
  type AppProfileRole,
} from "@/lib/messages/access";
import type {
  CoachContactRequestDto,
  MessageDto,
  MessageInboxResponse,
  MessageNotificationPreview,
  MessageThreadKind,
  MessageThreadMessagesResponse,
  MessageThreadSummary,
} from "@/lib/messages/types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ProfileRow = {
  id: string;
  role: AppProfileRole;
  full_name: string | null;
  avatar_url: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type ThreadRow = {
  id: string;
  kind: MessageThreadKind;
  workspace_org_id: string;
  student_id: string | null;
  group_id: string | null;
  participant_a_id: string;
  participant_b_id: string;
  last_message_id: number | string | null;
  last_message_at: string | null;
};

type ThreadMemberRow = {
  thread_id: string;
  user_id: string;
  last_read_message_id: number | string | null;
  last_read_at: string | null;
  hidden_at?: string | null;
};

type MessageRow = {
  id: number | string;
  thread_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

type ContactRequestRow = {
  id: string;
  requester_user_id: string;
  target_user_id: string;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
};

const buildStudentDisplayName = (student: StudentRow | undefined) => {
  if (!student) return null;
  return `${student.first_name} ${student.last_name ?? ""}`.trim();
};

const loadProfilesMap = async (
  admin: AdminClient,
  userIds: string[]
): Promise<Map<string, ProfileRow>> => {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map<string, ProfileRow>();

  const { data } = await admin
    .from("profiles")
    .select("id, role, full_name, avatar_url")
    .in("id", uniqueIds);

  const map = new Map<string, ProfileRow>();
  (data ?? []).forEach((row) => {
    const typed = row as ProfileRow;
    map.set(typed.id, typed);
  });

  return map;
};

const loadStudentsMap = async (
  admin: AdminClient,
  studentIds: string[]
): Promise<Map<string, StudentRow>> => {
  const uniqueIds = Array.from(new Set(studentIds));
  if (uniqueIds.length === 0) return new Map<string, StudentRow>();

  const { data } = await admin
    .from("students")
    .select("id, first_name, last_name")
    .in("id", uniqueIds);

  const map = new Map<string, StudentRow>();
  (data ?? []).forEach((row) => {
    const typed = row as StudentRow;
    map.set(typed.id, typed);
  });

  return map;
};

const loadGroupsMap = async (
  admin: AdminClient,
  groupIds: string[]
): Promise<Map<string, GroupRow>> => {
  const uniqueIds = Array.from(new Set(groupIds));
  if (uniqueIds.length === 0) return new Map<string, GroupRow>();

  const { data } = await admin
    .from("org_groups")
    .select("id, name")
    .in("id", uniqueIds);

  const map = new Map<string, GroupRow>();
  (data ?? []).forEach((row) => {
    const typed = row as GroupRow;
    map.set(typed.id, typed);
  });

  return map;
};

const loadGroupIdsForUser = async (
  admin: AdminClient,
  userId: string,
  groupIds: string[]
): Promise<Set<string>> => {
  const uniqueGroupIds = Array.from(new Set(groupIds));
  if (uniqueGroupIds.length === 0) return new Set<string>();

  const [{ data: coachRows }, { data: studentAccountRows }] = await Promise.all([
    admin
      .from("org_group_coaches")
      .select("group_id")
      .eq("coach_id", userId)
      .in("group_id", uniqueGroupIds),
    admin
      .from("student_accounts")
      .select("student_id")
      .eq("user_id", userId),
  ]);

  const allowed = new Set<string>(
    ((coachRows ?? []) as Array<{ group_id: string }>).map((row) => row.group_id)
  );

  const studentIds = Array.from(
    new Set(
      ((studentAccountRows ?? []) as Array<{ student_id: string }>).map(
        (row) => row.student_id
      )
    )
  );

  if (studentIds.length > 0) {
    const { data: studentGroupRows } = await admin
      .from("org_group_students")
      .select("group_id")
      .in("group_id", uniqueGroupIds)
      .in("student_id", studentIds);

    ((studentGroupRows ?? []) as Array<{ group_id: string }>).forEach((row) => {
      allowed.add(row.group_id);
    });
  }

  return allowed;
};

const loadMessagesMap = async (
  admin: AdminClient,
  messageIds: number[]
): Promise<Map<number, MessageRow>> => {
  const uniqueIds = Array.from(new Set(messageIds));
  if (uniqueIds.length === 0) return new Map<number, MessageRow>();

  const { data } = await admin
    .from("message_messages")
    .select("id, thread_id, sender_user_id, body, created_at")
    .in("id", uniqueIds);

  const map = new Map<number, MessageRow>();
  (data ?? []).forEach((row) => {
    const typed = row as MessageRow;
    const id = coerceMessageId(typed.id);
    if (!id) return;
    map.set(id, typed);
  });

  return map;
};

const countUnreadMessagesInThread = async (
  admin: AdminClient,
  threadId: string,
  userId: string,
  lastReadMessageId: number | null
): Promise<number> => {
  let query = admin
    .from("message_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .neq("sender_user_id", userId);

  if (lastReadMessageId) {
    query = query.gt("id", lastReadMessageId);
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
};

const buildMessageDto = (
  row: MessageRow,
  senderProfile: ProfileRow | null
): MessageDto | null => {
  const messageId = coerceMessageId(row.id);
  if (!messageId) return null;

  return {
    id: messageId,
    threadId: row.thread_id,
    senderUserId: row.sender_user_id,
    senderName: senderProfile?.full_name ?? null,
    senderAvatarUrl: senderProfile?.avatar_url ?? null,
    senderRole: senderProfile?.role ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
};

export const loadThreadParticipantContext = async (
  admin: AdminClient,
  threadId: string,
  userId: string
): Promise<{
  thread: ThreadRow;
  ownMember: ThreadMemberRow;
  counterpartMember: ThreadMemberRow | null;
} | null> => {
  const { data: threadData } = await admin
    .from("message_threads")
    .select(
      "id, kind, workspace_org_id, student_id, group_id, participant_a_id, participant_b_id, last_message_id, last_message_at"
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!threadData) return null;
  const thread = threadData as ThreadRow;

  const { data: memberData } = await admin
    .from("message_thread_members")
    .select("thread_id, user_id, last_read_message_id, last_read_at, hidden_at")
    .eq("thread_id", thread.id);

  const members = (memberData ?? []) as ThreadMemberRow[];
  const ownMember = members.find((member) => member.user_id === userId) ?? null;
  if (!ownMember) return null;
  if (ownMember.hidden_at) return null;

  if (thread.kind === "group" || thread.kind === "group_info") {
    if (!thread.group_id) return null;
    const isGroupMember = await isUserInOrgGroup(admin, userId, thread.group_id);
    if (!isGroupMember) return null;
  }

  if (thread.kind === "org_coaches") {
    const isCoachMember = await isCoachLikeActiveOrgMember(
      admin,
      thread.workspace_org_id,
      userId
    );
    if (!isCoachMember) return null;
  }

  if (thread.kind === "org_info") {
    const isCoachMember = await isCoachLikeActiveOrgMember(
      admin,
      thread.workspace_org_id,
      userId
    );
    if (!isCoachMember) {
      const isStudentMember = await isStudentLinkedToOrganization(
        admin,
        userId,
        thread.workspace_org_id
      );
      if (!isStudentMember) return null;
    }
  }

  const counterpartMember =
    thread.kind === "group"
      ? null
      : members.find((member) => member.user_id !== userId) ?? null;
  return { thread, ownMember, counterpartMember };
};

export const loadInbox = async (
  admin: AdminClient,
  userId: string
): Promise<MessageInboxResponse> => {
  const { data: ownVisibleMemberData } = await admin
    .from("message_thread_members")
    .select("thread_id, user_id, last_read_message_id, last_read_at, hidden_at")
    .eq("user_id", userId)
    .is("hidden_at", null);

  const visibleMembers = (ownVisibleMemberData ?? []) as ThreadMemberRow[];
  const visibleThreadIds = visibleMembers
    .map((member) => member.thread_id)
    .filter((value, index, array) => array.indexOf(value) === index);

  if (visibleThreadIds.length === 0) {
    return { threads: [], unreadMessagesCount: 0 };
  }

  const { data: threadData } = await admin
    .from("message_threads")
    .select(
      "id, kind, workspace_org_id, student_id, group_id, participant_a_id, participant_b_id, last_message_id, last_message_at"
    )
    .in("id", visibleThreadIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  let threads = (threadData ?? []) as ThreadRow[];

  const groupIds = threads
    .filter(
      (thread) =>
        (thread.kind === "group" || thread.kind === "group_info") && thread.group_id
    )
    .map((thread) => thread.group_id as string);
  if (groupIds.length > 0) {
    const allowedGroupIds = await loadGroupIdsForUser(admin, userId, groupIds);
    threads = threads.filter(
      (thread) => {
        const isGroupKind =
          thread.kind === "group" || thread.kind === "group_info";
        return !isGroupKind || (thread.group_id !== null && allowedGroupIds.has(thread.group_id));
      }
    );
  }

  if (threads.length === 0) {
    return { threads: [], unreadMessagesCount: 0 };
  }

  const threadIds = threads.map((thread) => thread.id);
  const { data: allMemberData } = await admin
    .from("message_thread_members")
    .select("thread_id, user_id, last_read_message_id, last_read_at, hidden_at")
    .in("thread_id", threadIds);

  const ownMemberMap = new Map<string, ThreadMemberRow>();
  visibleMembers.forEach((member) => {
    ownMemberMap.set(member.thread_id, member);
  });

  const allMembersByThread = new Map<string, ThreadMemberRow[]>();
  ((allMemberData ?? []) as ThreadMemberRow[]).forEach((member) => {
    const existing = allMembersByThread.get(member.thread_id) ?? [];
    existing.push(member);
    allMembersByThread.set(member.thread_id, existing);
  });

  const lastMessageIds = threads
    .map((thread) => coerceMessageId(thread.last_message_id))
    .filter((value): value is number => value !== null);

  const participantIds = threads.flatMap((thread) => [
    thread.participant_a_id,
    thread.participant_b_id,
  ]);
  const studentIds = threads
    .map((thread) => thread.student_id)
    .filter((value): value is string => Boolean(value));
  const groupIdsForLabels = threads
    .map((thread) => thread.group_id)
    .filter((value): value is string => Boolean(value));

  const [profileMap, studentMap, groupMap, lastMessagesMap] = await Promise.all([
    loadProfilesMap(admin, participantIds),
    loadStudentsMap(admin, studentIds),
    loadGroupsMap(admin, groupIdsForLabels),
    loadMessagesMap(admin, lastMessageIds),
  ]);

  const unreadCounts = await Promise.all(
    threads.map(async (thread) => {
      const ownMember = ownMemberMap.get(thread.id);
      const lastReadMessageId = coerceMessageId(ownMember?.last_read_message_id ?? null);
      const lastMessageId = coerceMessageId(thread.last_message_id);
      if (!lastMessageId) {
        return { threadId: thread.id, unreadCount: 0 };
      }

      if (lastReadMessageId && lastMessageId <= lastReadMessageId) {
        return { threadId: thread.id, unreadCount: 0 };
      }

      const unreadCount = await countUnreadMessagesInThread(
        admin,
        thread.id,
        userId,
        lastReadMessageId
      );

      return { threadId: thread.id, unreadCount };
    })
  );

  const unreadByThread = new Map<string, number>();
  unreadCounts.forEach((entry) => unreadByThread.set(entry.threadId, entry.unreadCount));

  const summaries: MessageThreadSummary[] = threads.map((thread) => {
    const ownMember = ownMemberMap.get(thread.id) ?? null;
    const members = allMembersByThread.get(thread.id) ?? [];
    const counterpartMember = members.find((member) => member.user_id !== userId) ?? null;

    const isGroupKind = thread.kind === "group" || thread.kind === "group_info";
    const isOrgChannelKind =
      thread.kind === "org_info" || thread.kind === "org_coaches";

    const counterpartUserId =
      isGroupKind || isOrgChannelKind
        ? null
        : thread.participant_a_id === userId
          ? thread.participant_b_id
          : thread.participant_a_id;
    const counterpartProfile = counterpartUserId ? profileMap.get(counterpartUserId) : null;
    const participantAProfile = profileMap.get(thread.participant_a_id);
    const participantBProfile = profileMap.get(thread.participant_b_id);
    const groupName = thread.group_id ? groupMap.get(thread.group_id)?.name ?? null : null;

    const lastMessageId = coerceMessageId(thread.last_message_id);
    const lastMessage = lastMessageId ? lastMessagesMap.get(lastMessageId) ?? null : null;

    const unreadCount = unreadByThread.get(thread.id) ?? 0;

    return {
      threadId: thread.id,
      kind: thread.kind,
      workspaceOrgId: thread.workspace_org_id,
      studentId: thread.student_id,
      studentName: buildStudentDisplayName(
        thread.student_id ? studentMap.get(thread.student_id) : undefined
      ),
      groupId: thread.group_id,
      groupName,
      participantAId: thread.participant_a_id,
      participantAName: participantAProfile?.full_name ?? null,
      participantBId: thread.participant_b_id,
      participantBName: participantBProfile?.full_name ?? null,
      counterpartUserId,
      counterpartName:
        thread.kind === "group"
          ? groupName
          : thread.kind === "group_info"
            ? groupName
              ? `Infos groupe · ${groupName}`
              : "Infos groupe"
            : thread.kind === "org_info"
              ? "Infos organisation"
              : thread.kind === "org_coaches"
                ? "Canal coachs organisation"
                : counterpartProfile?.full_name ?? null,
      lastMessageId,
      lastMessageAt: thread.last_message_at,
      lastMessagePreview: lastMessage?.body ?? null,
      lastMessageSenderUserId: lastMessage?.sender_user_id ?? null,
      unread: unreadCount > 0,
      unreadCount,
      ownLastReadMessageId: coerceMessageId(ownMember?.last_read_message_id ?? null),
      ownLastReadAt: ownMember?.last_read_at ?? null,
      counterpartLastReadMessageId:
        thread.kind === "group" || thread.kind === "group_info"
          ? null
          : coerceMessageId(counterpartMember?.last_read_message_id ?? null),
      counterpartLastReadAt:
        thread.kind === "group" || thread.kind === "group_info"
          ? null
          : counterpartMember?.last_read_at ?? null,
    };
  });

  const unreadMessagesCount = summaries.reduce(
    (acc, thread) => acc + thread.unreadCount,
    0
  );

  return {
    threads: summaries,
    unreadMessagesCount,
  };
};

export const loadThreadMessages = async (
  admin: AdminClient,
  threadId: string,
  cursor: number | null,
  limit: number
): Promise<{
  rows: MessageDto[];
  nextCursor: number | null;
}> => {
  let query = admin
    .from("message_messages")
    .select("id, thread_id, sender_user_id, body, created_at")
    .eq("thread_id", threadId)
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("id", cursor);
  }

  const { data } = await query;
  const rawRows = (data ?? []) as MessageRow[];

  const senderIds = rawRows.map((row) => row.sender_user_id);
  const profileMap = await loadProfilesMap(admin, senderIds);

  const messages = rawRows
    .map((row) => buildMessageDto(row, profileMap.get(row.sender_user_id) ?? null))
    .filter((row): row is MessageDto => row !== null)
    .sort((a, b) => a.id - b.id);

  const nextCursor =
    rawRows.length === limit
      ? coerceMessageId(rawRows[rawRows.length - 1]?.id ?? null)
      : null;

  return {
    rows: messages,
    nextCursor,
  };
};

export const buildThreadMessagesResponse = (
  threadId: string,
  messages: MessageDto[],
  nextCursor: number | null,
  ownMember: ThreadMemberRow,
  counterpartMember: ThreadMemberRow | null
): MessageThreadMessagesResponse => {
  return {
    threadId,
    messages,
    nextCursor,
    ownLastReadMessageId: coerceMessageId(ownMember.last_read_message_id),
    ownLastReadAt: ownMember.last_read_at ?? null,
    counterpartLastReadMessageId: coerceMessageId(
      counterpartMember?.last_read_message_id ?? null
    ),
    counterpartLastReadAt: counterpartMember?.last_read_at ?? null,
  };
};

export const buildUnreadPreviews = (
  inbox: MessageInboxResponse,
  userId: string
): MessageNotificationPreview[] => {
  return inbox.threads
    .filter(
      (thread) =>
        thread.unread &&
        thread.lastMessageSenderUserId !== null &&
        thread.lastMessageSenderUserId !== userId &&
        thread.lastMessagePreview !== null &&
        thread.lastMessageAt !== null
    )
    .slice(0, 5)
    .map((thread) => ({
      threadId: thread.threadId,
      kind: thread.kind,
      fromName: thread.counterpartName,
      bodyPreview: thread.lastMessagePreview ?? "",
      createdAt: thread.lastMessageAt ?? new Date().toISOString(),
    }));
};

export const buildCoachContactRequestDtos = async (
  admin: AdminClient,
  rows: ContactRequestRow[]
): Promise<CoachContactRequestDto[]> => {
  if (rows.length === 0) return [];

  const userIds = rows.flatMap((row) => [row.requester_user_id, row.target_user_id]);
  const [profiles, emailMap] = await Promise.all([
    loadProfilesMap(admin, userIds),
    loadUserEmailsByIds(admin, userIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    requesterUserId: row.requester_user_id,
    targetUserId: row.target_user_id,
    requesterName: profiles.get(row.requester_user_id)?.full_name ?? null,
    targetName: profiles.get(row.target_user_id)?.full_name ?? null,
    requesterEmail: emailMap.get(row.requester_user_id) ?? null,
    targetEmail: emailMap.get(row.target_user_id) ?? null,
    createdAt: row.created_at,
  }));
};
