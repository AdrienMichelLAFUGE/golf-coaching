import { NextResponse } from "next/server";
import { z } from "zod";
import {
  coerceMessageId,
  hasCoachContactOptIn,
  isCoachLikeActiveOrgMember,
  isCoachAllowedForStudent,
  isCoachLikeRole,
  isStudentLinkedToStudentId,
  isStudentLinkedToOrganization,
  loadOrgAudienceUserIds,
  loadOrgCoachUserIds,
  loadOrgGroupMemberUserIds,
  loadMessageActorContext,
  loadStudentUserId,
} from "@/lib/messages/access";
import {
  buildThreadMessagesResponse,
  loadThreadMessages,
  loadThreadParticipantContext,
} from "@/lib/messages/service";
import { SendMessageSchema } from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type Params = { params: { threadId: string } | Promise<{ threadId: string }> };

const threadParamsSchema = z.object({
  threadId: z.string().uuid(),
});

const threadQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const resolveThreadId = async (params: Params["params"]) => {
  const value = await params;
  const parsed = threadParamsSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.threadId;
};

export async function GET(request: Request, { params }: Params) {
  const threadId = await resolveThreadId(params);
  if (!threadId) {
    return NextResponse.json({ error: "Payload invalide." }, { status: 422 });
  }

  const query = new URL(request.url).searchParams;
  const parsedQuery = threadQuerySchema.safeParse({
    cursor: query.get("cursor") ?? undefined,
    limit: query.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedQuery.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const participantContext = await loadThreadParticipantContext(
    context.admin,
    threadId,
    context.userId
  );

  if (!participantContext) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { rows, nextCursor } = await loadThreadMessages(
    context.admin,
    threadId,
    parsedQuery.data.cursor ?? null,
    parsedQuery.data.limit ?? 50
  );

  return NextResponse.json(
    buildThreadMessagesResponse(
      threadId,
      rows,
      nextCursor,
      participantContext.ownMember,
      participantContext.counterpartMember
    )
  );
}

export async function POST(request: Request, { params }: Params) {
  const parsedBody = await parseRequestJson(request, SendMessageSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const threadId = await resolveThreadId(params);
  if (!threadId) {
    return NextResponse.json({ error: "Payload invalide." }, { status: 422 });
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const participantContext = await loadThreadParticipantContext(
    context.admin,
    threadId,
    context.userId
  );

  if (!participantContext) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  let threadMemberUserIds: string[] | null = null;
  if (
    participantContext.thread.kind === "group" ||
    participantContext.thread.kind === "group_info"
  ) {
    if (!participantContext.thread.group_id) {
      return NextResponse.json({ error: "Thread invalide." }, { status: 409 });
    }

    const groupMembers = await loadOrgGroupMemberUserIds(
      context.admin,
      participantContext.thread.group_id
    );
    if (!groupMembers.memberUserIds.includes(context.userId)) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    if (
      participantContext.thread.kind === "group_info" &&
      !groupMembers.coachUserIds.includes(context.userId)
    ) {
      return NextResponse.json(
        { error: "Acces refuse: seuls les coachs assignes peuvent publier." },
        { status: 403 }
      );
    }
    if (groupMembers.memberUserIds.length < 2) {
      return NextResponse.json(
        { error: "Conversation de groupe impossible: membres insuffisants." },
        { status: 409 }
      );
    }

    threadMemberUserIds = groupMembers.memberUserIds;

    await context.admin.from("message_thread_members").upsert(
      threadMemberUserIds.map((userId) => ({ thread_id: threadId, user_id: userId })),
      { onConflict: "thread_id,user_id" }
    );
  }

  if (participantContext.thread.kind === "student_coach") {
    if (!participantContext.thread.student_id) {
      return NextResponse.json({ error: "Thread invalide." }, { status: 409 });
    }

    const studentUserId = await loadStudentUserId(
      context.admin,
      participantContext.thread.student_id
    );

    if (!studentUserId) {
      return NextResponse.json(
        { error: "Eleve non active: compte eleve introuvable." },
        { status: 409 }
      );
    }

    const coachUserId =
      participantContext.thread.participant_a_id === studentUserId
        ? participantContext.thread.participant_b_id
        : participantContext.thread.participant_a_id;

    if (context.userId === studentUserId) {
      const isLinked = await isStudentLinkedToStudentId(
        context.admin,
        context.userId,
        participantContext.thread.student_id
      );
      if (!isLinked) {
        return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
      }

      const isAssignedCoach = await isCoachAllowedForStudent(
        context.admin,
        coachUserId,
        participantContext.thread.student_id
      );
      if (!isAssignedCoach) {
        return NextResponse.json(
          { error: "Acces refuse: coach non assigne." },
          { status: 403 }
        );
      }
    } else if (context.userId === coachUserId) {
      const isAssignedCoach = await isCoachAllowedForStudent(
        context.admin,
        context.userId,
        participantContext.thread.student_id
      );
      if (!isAssignedCoach) {
        return NextResponse.json(
          { error: "Acces refuse: coach non assigne." },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
  }

  if (participantContext.thread.kind === "coach_coach") {
    if (!isCoachLikeRole(context.profile.role)) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const counterpartUserId =
      participantContext.thread.participant_a_id === context.userId
        ? participantContext.thread.participant_b_id
        : participantContext.thread.participant_a_id;

    let isSameOrgCoach = false;
    if (
      context.activeWorkspace.workspace_type === "org" &&
      participantContext.thread.workspace_org_id === context.activeWorkspace.id
    ) {
      isSameOrgCoach = await isCoachLikeActiveOrgMember(
        context.admin,
        context.activeWorkspace.id,
        counterpartUserId
      );
    }

    if (!isSameOrgCoach) {
      const hasContact = await hasCoachContactOptIn(
        context.admin,
        participantContext.thread.participant_a_id,
        participantContext.thread.participant_b_id
      );
      if (!hasContact) {
        return NextResponse.json(
          { error: "Acces refuse: contact coach non autorise." },
          { status: 403 }
        );
      }
    }
  }

  if (participantContext.thread.kind === "org_info") {
    if (context.activeWorkspace.workspace_type !== "org") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    if (!isCoachLikeRole(context.profile.role)) {
      return NextResponse.json(
        { error: "Acces refuse: conversation en lecture seule." },
        { status: 403 }
      );
    }

    const audience = await loadOrgAudienceUserIds(
      context.admin,
      participantContext.thread.workspace_org_id
    );

    if (!audience.memberUserIds.includes(context.userId)) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    if (!audience.coachUserIds.includes(context.userId)) {
      return NextResponse.json(
        { error: "Acces refuse: seuls les coachs/admin peuvent publier." },
        { status: 403 }
      );
    }

    threadMemberUserIds = audience.memberUserIds;
    await context.admin.from("message_thread_members").upsert(
      threadMemberUserIds.map((userId) => ({ thread_id: threadId, user_id: userId })),
      { onConflict: "thread_id,user_id" }
    );
  }

  if (participantContext.thread.kind === "org_coaches") {
    if (context.activeWorkspace.workspace_type !== "org") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    if (!isCoachLikeRole(context.profile.role)) {
      return NextResponse.json(
        { error: "Acces refuse: conversation reservee aux coachs/admin." },
        { status: 403 }
      );
    }

    const coachUserIds = await loadOrgCoachUserIds(
      context.admin,
      participantContext.thread.workspace_org_id
    );
    if (!coachUserIds.includes(context.userId)) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    threadMemberUserIds = coachUserIds;
    await context.admin.from("message_thread_members").upsert(
      threadMemberUserIds.map((userId) => ({ thread_id: threadId, user_id: userId })),
      { onConflict: "thread_id,user_id" }
    );
  }

  if (context.profile.role === "student") {
    const canReadOrgInfoAsStudent =
      participantContext.thread.kind === "org_info" &&
      (await isStudentLinkedToOrganization(
        context.admin,
        context.userId,
        participantContext.thread.workspace_org_id
      ));
    if (
      !canReadOrgInfoAsStudent &&
      participantContext.thread.kind !== "student_coach" &&
      participantContext.thread.kind !== "group"
    ) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
  }

  const messageBody = parsedBody.data.body.trim();
  const { data: insertData, error: insertError } = await context.admin
    .from("message_messages")
    .insert([
      {
        thread_id: threadId,
        sender_user_id: context.userId,
        body: messageBody,
      },
    ])
    .select("id, thread_id, sender_user_id, body, created_at")
    .single();

  if (insertError || !insertData) {
    return NextResponse.json(
      { error: insertError?.message ?? "Envoi impossible." },
      { status: 400 }
    );
  }

  const messageId = coerceMessageId((insertData as { id: number | string }).id);
  if (!messageId) {
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }

  await context.admin
    .from("message_thread_members")
    .update({
      hidden_at: null,
    })
    .eq("thread_id", threadId)
    .in("user_id", [
      ...(threadMemberUserIds ?? []),
      context.userId,
      participantContext.counterpartMember?.user_id ?? context.userId,
    ]);

  await context.admin
    .from("message_thread_members")
    .update({
      last_read_message_id: messageId,
      last_read_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .eq("user_id", context.userId);

  return NextResponse.json({
    message: {
      id: messageId,
      threadId,
      senderUserId: context.userId,
      senderName: context.profile.full_name ?? null,
      senderAvatarUrl: context.profile.avatar_url ?? null,
      senderRole: context.profile.role,
      body: (insertData as { body: string }).body,
      createdAt: (insertData as { created_at: string }).created_at,
    },
  });
}
