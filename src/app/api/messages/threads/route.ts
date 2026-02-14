import { NextResponse } from "next/server";
import {
  type AppProfileRole,
  hasCoachContactOptIn,
  isCoachLikeActiveOrgMember,
  isCoachAllowedForStudent,
  isCoachLikeRole,
  isStudentLinkedToStudentId,
  loadOrgAudienceUserIds,
  loadOrgCoachUserIds,
  loadOrgGroupMemberUserIds,
  loadOrgGroupRow,
  loadMessageActorContext,
  loadStudentRow,
  loadStudentUserId,
  normalizeUserPair,
} from "@/lib/messages/access";
import { CreateMessageThreadSchema } from "@/lib/messages/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const createThreadResponse = (threadId: string, created: boolean) =>
  NextResponse.json({ threadId, created });

const createThreadMembers = async (
  admin: AdminClient,
  threadId: string,
  userIds: string[],
  reopenUserIds?: string[]
) => {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return;

  await admin.from("message_thread_members").upsert(
    uniqueUserIds.map((userId) => ({ thread_id: threadId, user_id: userId })),
    { onConflict: "thread_id,user_id" }
  );

  if (reopenUserIds && reopenUserIds.length > 0) {
    const uniqueReopenUserIds = Array.from(new Set(reopenUserIds));
    await admin
      .from("message_thread_members")
      .update({ hidden_at: null })
      .eq("thread_id", threadId)
      .in("user_id", uniqueReopenUserIds);
  }
};

const getExistingGroupThreadId = async (
  admin: AdminClient,
  groupId: string,
  kind: "group" | "group_info"
): Promise<string | null> => {
  const { data } = await admin
    .from("message_threads")
    .select("id")
    .eq("kind", kind)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
};

const getExistingOrgThreadId = async (
  admin: AdminClient,
  orgId: string,
  kind: "org_info" | "org_coaches"
): Promise<string | null> => {
  const { data } = await admin
    .from("message_threads")
    .select("id")
    .eq("kind", kind)
    .eq("workspace_org_id", orgId)
    .is("student_id", null)
    .is("group_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
};

const getExistingThreadId = async (
  admin: AdminClient,
  kind: "student_coach" | "coach_coach",
  participantAId: string,
  participantBId: string,
  studentId: string | null
): Promise<string | null> => {
  let query = admin
    .from("message_threads")
    .select("id")
    .eq("kind", kind)
    .eq("participant_a_id", participantAId)
    .eq("participant_b_id", participantBId)
    .order("created_at", { ascending: true })
    .limit(1);

  query = studentId ? query.eq("student_id", studentId) : query.is("student_id", null);

  const { data } = await query.maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, CreateMessageThreadSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const admin = context.admin;
  if (parsed.data.kind === "group" || parsed.data.kind === "group_info") {
    if (context.activeWorkspace.workspace_type !== "org") {
      return NextResponse.json(
        { error: "Messagerie de groupe reservee aux structures." },
        { status: 403 }
      );
    }

    const group = await loadOrgGroupRow(admin, parsed.data.groupId);
    if (!group || group.org_id !== context.activeWorkspace.id) {
      return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
    }

    const groupMembers = await loadOrgGroupMemberUserIds(admin, group.id);
    if (!groupMembers.memberUserIds.includes(context.userId)) {
      return NextResponse.json(
        { error: "Acces refuse: vous n appartenez pas a ce groupe." },
        { status: 403 }
      );
    }

    if (
      parsed.data.kind === "group_info" &&
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

    const sortedMembers = [...groupMembers.memberUserIds].sort((a, b) =>
      a.localeCompare(b)
    );
    const participantAId = sortedMembers[0] ?? context.userId;
    const participantBId = sortedMembers[1] ?? context.userId;

    const existingThreadId = await getExistingGroupThreadId(
      admin,
      group.id,
      parsed.data.kind
    );
    if (existingThreadId) {
      await createThreadMembers(
        admin,
        existingThreadId,
        groupMembers.memberUserIds,
        [context.userId]
      );
      return createThreadResponse(existingThreadId, false);
    }

    const { data: insertData, error: insertError } = await admin
      .from("message_threads")
      .insert([
        {
          kind: parsed.data.kind,
          workspace_org_id: group.org_id,
          student_id: null,
          group_id: group.id,
          participant_a_id: participantAId,
          participant_b_id: participantBId,
          created_by: context.userId,
        },
      ])
      .select("id")
      .single();

    if (insertError || !insertData) {
      const existingAfterConflict = await getExistingGroupThreadId(
        admin,
        group.id,
        parsed.data.kind
      );
      if (existingAfterConflict) {
        await createThreadMembers(
          admin,
          existingAfterConflict,
          groupMembers.memberUserIds,
          [context.userId]
        );
        return createThreadResponse(existingAfterConflict, false);
      }

      return NextResponse.json(
        { error: insertError?.message ?? "Creation thread impossible." },
        { status: 400 }
      );
    }

    const threadId = (insertData as { id: string }).id;
    await createThreadMembers(admin, threadId, groupMembers.memberUserIds);

    return createThreadResponse(threadId, true);
  }

  if (parsed.data.kind === "student_coach") {
    const student = await loadStudentRow(admin, parsed.data.studentId);
    if (!student) {
      return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
    }

    const { data: coachProfile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", parsed.data.coachId)
      .maybeSingle();

    if (
      !coachProfile ||
      !isCoachLikeRole((coachProfile as { role: AppProfileRole }).role)
    ) {
      return NextResponse.json({ error: "Coach introuvable." }, { status: 404 });
    }

    const studentUserId = await loadStudentUserId(admin, student.id);
    if (!studentUserId) {
      return NextResponse.json(
        { error: "Eleve non active: compte eleve introuvable." },
        { status: 409 }
      );
    }

    const pair = normalizeUserPair(studentUserId, parsed.data.coachId);

    if (context.userId !== studentUserId && context.userId !== parsed.data.coachId) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    if (context.userId === studentUserId) {
      const isLinked = await isStudentLinkedToStudentId(admin, context.userId, student.id);
      if (!isLinked) {
        return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
      }

      const isAssignedCoach = await isCoachAllowedForStudent(
        admin,
        parsed.data.coachId,
        student.id
      );
      if (!isAssignedCoach) {
        return NextResponse.json(
          { error: "Acces refuse: coach non assigne." },
          { status: 403 }
        );
      }
    } else {
      if (context.userId !== parsed.data.coachId) {
        return NextResponse.json(
          { error: "Creation reservee au coach participant." },
          { status: 403 }
        );
      }

      const isAssignedCoach = await isCoachAllowedForStudent(
        admin,
        context.userId,
        student.id
      );
      if (!isAssignedCoach) {
        return NextResponse.json(
          { error: "Acces refuse: coach non assigne." },
          { status: 403 }
        );
      }
    }

    const existingThreadId = await getExistingThreadId(
      admin,
      "student_coach",
      pair.participantAId,
      pair.participantBId,
      student.id
    );
    if (existingThreadId) {
      await createThreadMembers(
        admin,
        existingThreadId,
        [studentUserId, parsed.data.coachId],
        [context.userId]
      );
      return createThreadResponse(existingThreadId, false);
    }

    const { data: insertData, error: insertError } = await admin
      .from("message_threads")
      .insert([
        {
          kind: "student_coach",
          workspace_org_id: student.org_id,
          student_id: student.id,
          participant_a_id: pair.participantAId,
          participant_b_id: pair.participantBId,
          created_by: context.userId,
        },
      ])
      .select("id")
      .single();

    if (insertError || !insertData) {
      const existingAfterConflict = await getExistingThreadId(
        admin,
        "student_coach",
        pair.participantAId,
        pair.participantBId,
        student.id
      );
      if (existingAfterConflict) {
        await createThreadMembers(
          admin,
          existingAfterConflict,
          [studentUserId, parsed.data.coachId],
          [context.userId]
        );
        return createThreadResponse(existingAfterConflict, false);
      }

      return NextResponse.json(
        { error: insertError?.message ?? "Creation thread impossible." },
        { status: 400 }
      );
    }

    const threadId = (insertData as { id: string }).id;
    await createThreadMembers(admin, threadId, [studentUserId, parsed.data.coachId]);

    return createThreadResponse(threadId, true);
  }

  if (parsed.data.kind === "org_info" || parsed.data.kind === "org_coaches") {
    if (context.activeWorkspace.workspace_type !== "org") {
      return NextResponse.json(
        { error: "Conversation organisation reservee aux structures." },
        { status: 403 }
      );
    }

    if (!isCoachLikeRole(context.profile.role)) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const audience =
      parsed.data.kind === "org_info"
        ? await loadOrgAudienceUserIds(admin, context.activeWorkspace.id)
        : (() => {
            const coaches = loadOrgCoachUserIds(admin, context.activeWorkspace.id);
            return coaches.then((coachUserIds) => ({
              coachUserIds,
              studentUserIds: [] as string[],
              memberUserIds: coachUserIds,
            }));
          })();

    const resolvedAudience = await audience;
    if (!resolvedAudience.coachUserIds.includes(context.userId)) {
      return NextResponse.json(
        { error: "Acces refuse: vous ne pouvez pas publier ce canal." },
        { status: 403 }
      );
    }

    if (resolvedAudience.memberUserIds.length < 2) {
      return NextResponse.json(
        { error: "Conversation impossible: membres insuffisants." },
        { status: 409 }
      );
    }

    const sortedMembers = [...resolvedAudience.memberUserIds].sort((a, b) =>
      a.localeCompare(b)
    );
    const participantAId = sortedMembers[0] ?? context.userId;
    const participantBId = sortedMembers[1] ?? context.userId;

    const existingThreadId = await getExistingOrgThreadId(
      admin,
      context.activeWorkspace.id,
      parsed.data.kind
    );
    if (existingThreadId) {
      await createThreadMembers(
        admin,
        existingThreadId,
        resolvedAudience.memberUserIds,
        [context.userId]
      );
      return createThreadResponse(existingThreadId, false);
    }

    const { data: insertData, error: insertError } = await admin
      .from("message_threads")
      .insert([
        {
          kind: parsed.data.kind,
          workspace_org_id: context.activeWorkspace.id,
          student_id: null,
          group_id: null,
          participant_a_id: participantAId,
          participant_b_id: participantBId,
          created_by: context.userId,
        },
      ])
      .select("id")
      .single();

    if (insertError || !insertData) {
      const existingAfterConflict = await getExistingOrgThreadId(
        admin,
        context.activeWorkspace.id,
        parsed.data.kind
      );
      if (existingAfterConflict) {
        await createThreadMembers(
          admin,
          existingAfterConflict,
          resolvedAudience.memberUserIds,
          [context.userId]
        );
        return createThreadResponse(existingAfterConflict, false);
      }

      return NextResponse.json(
        { error: insertError?.message ?? "Creation thread impossible." },
        { status: 400 }
      );
    }

    const threadId = (insertData as { id: string }).id;
    await createThreadMembers(admin, threadId, resolvedAudience.memberUserIds);
    return createThreadResponse(threadId, true);
  }

  if (!isCoachLikeRole(context.profile.role)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (parsed.data.coachUserId === context.userId) {
    return NextResponse.json(
      { error: "Conversation avec soi-meme impossible." },
      { status: 409 }
    );
  }

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", parsed.data.coachUserId)
    .maybeSingle();

  if (
    !targetProfile ||
    !isCoachLikeRole((targetProfile as { role: AppProfileRole }).role)
  ) {
    return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  }

  let isSameOrgCoach = false;
  if (context.activeWorkspace.workspace_type === "org") {
    isSameOrgCoach = await isCoachLikeActiveOrgMember(
      admin,
      context.activeWorkspace.id,
      parsed.data.coachUserId
    );
  }

  if (!isSameOrgCoach) {
    const hasContact = await hasCoachContactOptIn(
      admin,
      context.userId,
      parsed.data.coachUserId
    );
    if (!hasContact) {
      return NextResponse.json(
        { error: "Acces refuse: contact coach non autorise." },
        { status: 403 }
      );
    }
  }

  const pair = normalizeUserPair(context.userId, parsed.data.coachUserId);
  const existingThreadId = await getExistingThreadId(
    admin,
    "coach_coach",
    pair.participantAId,
    pair.participantBId,
    null
  );

  if (existingThreadId) {
    await createThreadMembers(
      admin,
      existingThreadId,
      [context.userId, parsed.data.coachUserId],
      [context.userId]
    );
    return createThreadResponse(existingThreadId, false);
  }

  const { data: insertData, error: insertError } = await admin
    .from("message_threads")
    .insert([
      {
        kind: "coach_coach",
        workspace_org_id: context.activeWorkspace.id,
        student_id: null,
        participant_a_id: pair.participantAId,
        participant_b_id: pair.participantBId,
        created_by: context.userId,
      },
    ])
    .select("id")
    .single();

  if (insertError || !insertData) {
    const existingAfterConflict = await getExistingThreadId(
      admin,
      "coach_coach",
      pair.participantAId,
      pair.participantBId,
      null
    );

    if (existingAfterConflict) {
      await createThreadMembers(
        admin,
        existingAfterConflict,
        [context.userId, parsed.data.coachUserId],
        [context.userId]
      );
      return createThreadResponse(existingAfterConflict, false);
    }

    return NextResponse.json(
      { error: insertError?.message ?? "Creation thread impossible." },
      { status: 400 }
    );
  }

  const threadId = (insertData as { id: string }).id;
  await createThreadMembers(admin, threadId, [context.userId, parsed.data.coachUserId]);

  return createThreadResponse(threadId, true);
}
