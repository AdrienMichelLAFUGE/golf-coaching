import { messagesJson } from "@/lib/messages/http";
import {
  isCoachLikeRole,
  loadMessageActorContext,
  loadUserEmailsByIds,
} from "@/lib/messages/access";
import { buildCoachContactRequestDtos } from "@/lib/messages/service";
import type { MessageContactsResponse } from "@/lib/messages/types";
import { type createSupabaseAdminClient } from "@/lib/supabase/server";

const buildGroupTargets = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  groupIds: string[]
) => {
  const uniqueGroupIds = Array.from(new Set(groupIds));
  if (uniqueGroupIds.length === 0) return [] as MessageContactsResponse["groupTargets"];

  const [{ data: groupsData }, { data: studentRows }, { data: coachRows }] = await Promise.all([
    admin
      .from("org_groups")
      .select("id, name")
      .in("id", uniqueGroupIds),
    admin
      .from("org_group_students")
      .select("group_id")
      .in("group_id", uniqueGroupIds),
    admin
      .from("org_group_coaches")
      .select("group_id")
      .in("group_id", uniqueGroupIds),
  ]);

  const studentCountByGroup = new Map<string, number>();
  ((studentRows ?? []) as Array<{ group_id: string }>).forEach((row) => {
    studentCountByGroup.set(
      row.group_id,
      (studentCountByGroup.get(row.group_id) ?? 0) + 1
    );
  });

  const coachCountByGroup = new Map<string, number>();
  ((coachRows ?? []) as Array<{ group_id: string }>).forEach((row) => {
    coachCountByGroup.set(row.group_id, (coachCountByGroup.get(row.group_id) ?? 0) + 1);
  });

  return ((groupsData ?? []) as Array<{ id: string; name: string }>)
    .map((group) => ({
      groupId: group.id,
      groupName: group.name,
      studentCount: studentCountByGroup.get(group.id) ?? 0,
      coachCount: coachCountByGroup.get(group.id) ?? 0,
    }))
    .sort((first, second) => first.groupName.localeCompare(second.groupName));
};

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const admin = context.admin;

  if (context.profile.role === "student") {
    const studentIds = context.studentIds;

    if (studentIds.length === 0) {
      const empty: MessageContactsResponse = {
        coachContacts: [],
        studentTargets: [],
        groupTargets: [],
        pendingIncomingCoachContactRequests: [],
        pendingOutgoingCoachContactRequests: [],
      };
      return messagesJson(empty);
    }

    const [{ data: assignmentsData }, { data: studentsData }] = await Promise.all([
      admin
        .from("student_assignments")
        .select("student_id, coach_id")
        .in("student_id", studentIds),
      admin
        .from("students")
        .select("id, first_name, last_name")
        .in("id", studentIds),
    ]);

    const { data: studentAccountsData } = await admin
      .from("student_accounts")
      .select("student_id, user_id")
      .in("student_id", studentIds);

    const assignments =
      (assignmentsData ?? []) as Array<{ student_id: string; coach_id: string }>;
    const studentNameById = new Map<string, string>();
    ((studentsData ?? []) as Array<{ id: string; first_name: string; last_name: string | null }>).forEach(
      (student) => {
        const displayName = `${student.first_name} ${student.last_name ?? ""}`.trim();
        studentNameById.set(student.id, displayName);
      }
    );

    const coachIds = Array.from(new Set(assignments.map((row) => row.coach_id)));
    const studentAccounts =
      (studentAccountsData ?? []) as Array<{ student_id: string; user_id: string }>;
    const studentUserIds = Array.from(
      new Set(studentAccounts.map((account) => account.user_id))
    );
    const [coachProfileData, coachEmailMap] = await Promise.all([
      admin
        .from("profiles")
        .select("id, role, full_name")
        .in("id", coachIds),
      loadUserEmailsByIds(admin, coachIds),
    ]);
    const studentEmailMap = await loadUserEmailsByIds(admin, studentUserIds);
    const studentEmailById = new Map<string, string | null>();
    studentAccounts.forEach((account) => {
      if (studentEmailById.has(account.student_id)) return;
      studentEmailById.set(
        account.student_id,
        studentEmailMap.get(account.user_id) ?? null
      );
    });

    const coachById = new Map<
      string,
      { id: string; role: "owner" | "coach" | "staff" | "student"; full_name: string | null }
    >();
    (
      (coachProfileData.data ?? []) as Array<{
        id: string;
        role: "owner" | "coach" | "staff" | "student";
        full_name: string | null;
      }>
    ).forEach((coach) => {
      coachById.set(coach.id, coach);
    });

    const studentTargets = assignments
      .filter((row) => coachById.has(row.coach_id))
      .map((row) => ({
        studentId: row.student_id,
        studentName: studentNameById.get(row.student_id) ?? "Eleve",
        studentEmail: studentEmailById.get(row.student_id) ?? null,
        coachUserId: row.coach_id,
        coachName: coachById.get(row.coach_id)?.full_name ?? null,
        coachEmail: coachEmailMap.get(row.coach_id) ?? null,
      }));

    let groupTargets: MessageContactsResponse["groupTargets"] = [];
    if (context.activeWorkspace.workspace_type === "org") {
      const { data: groupStudentRows } = await admin
        .from("org_group_students")
        .select("group_id")
        .in("student_id", studentIds)
        .eq("org_id", context.activeWorkspace.id);

      groupTargets = await buildGroupTargets(
        admin,
        ((groupStudentRows ?? []) as Array<{ group_id: string }>).map((row) => row.group_id)
      );
    }

    const payload: MessageContactsResponse = {
      coachContacts: [],
      studentTargets,
      groupTargets,
      pendingIncomingCoachContactRequests: [],
      pendingOutgoingCoachContactRequests: [],
    };

    return messagesJson(payload);
  }

  const [contactsData, incomingRequestsData, outgoingRequestsData] = await Promise.all([
    admin
      .from("message_coach_contacts")
      .select("id, user_a_id, user_b_id")
      .or(`user_a_id.eq.${context.userId},user_b_id.eq.${context.userId}`),
    admin
      .from("message_coach_contact_requests")
      .select("id, requester_user_id, target_user_id, created_at")
      .eq("target_user_id", context.userId)
      .order("created_at", { ascending: false }),
    admin
      .from("message_coach_contact_requests")
      .select("id, requester_user_id, target_user_id, created_at")
      .eq("requester_user_id", context.userId)
      .order("created_at", { ascending: false }),
  ]);

  const contactRows =
    (contactsData.data ?? []) as Array<{ id: string; user_a_id: string; user_b_id: string }>;
  const counterpartIds = contactRows.map((row) =>
    row.user_a_id === context.userId ? row.user_b_id : row.user_a_id
  );

  const [counterpartProfilesData, counterpartEmails] = await Promise.all([
    counterpartIds.length > 0
      ? admin
          .from("profiles")
          .select("id, role, full_name")
          .in("id", counterpartIds)
      : Promise.resolve({ data: [] as Array<{ id: string; role: string; full_name: string | null }> }),
    loadUserEmailsByIds(admin, counterpartIds),
  ]);

  const counterpartProfiles =
    (counterpartProfilesData.data ?? []) as Array<{
      id: string;
      role: "owner" | "coach" | "staff" | "student";
      full_name: string | null;
    }>;

  const coachContactsFromOptIn = counterpartProfiles
    .filter((profile) => isCoachLikeRole(profile.role))
    .map((profile) => ({
      userId: profile.id,
      fullName: profile.full_name,
      email: counterpartEmails.get(profile.id) ?? null,
      role: profile.role,
      availability: "opt_in" as const,
    }));

  let coachContactsFromSameOrg: MessageContactsResponse["coachContacts"] = [];
  if (context.activeWorkspace.workspace_type === "org") {
    const { data: orgMemberRows } = await admin
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", context.activeWorkspace.id)
      .eq("status", "active");

    const orgMemberUserIds = Array.from(
      new Set(
        ((orgMemberRows ?? []) as Array<{ user_id: string }>)
          .map((row) => row.user_id)
          .filter((userId) => userId !== context.userId)
      )
    );

    if (orgMemberUserIds.length > 0) {
      const [orgProfilesData, orgEmails] = await Promise.all([
        admin
          .from("profiles")
          .select("id, role, full_name")
          .in("id", orgMemberUserIds),
        loadUserEmailsByIds(admin, orgMemberUserIds),
      ]);

      coachContactsFromSameOrg = (
        (orgProfilesData.data ?? []) as Array<{
          id: string;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        }>
      )
        .filter((profile) => isCoachLikeRole(profile.role))
        .map((profile) => ({
          userId: profile.id,
          fullName: profile.full_name,
          email: orgEmails.get(profile.id) ?? null,
          role: profile.role,
          availability: "same_org" as const,
        }));
    }
  }

  const coachContactsByUserId = new Map<string, MessageContactsResponse["coachContacts"][number]>();
  [...coachContactsFromOptIn, ...coachContactsFromSameOrg].forEach((contact) => {
    const existing = coachContactsByUserId.get(contact.userId);
    if (!existing) {
      coachContactsByUserId.set(contact.userId, contact);
      return;
    }

    if (existing.availability !== "same_org" && contact.availability === "same_org") {
      coachContactsByUserId.set(contact.userId, contact);
    }
  });

  const coachContacts = Array.from(coachContactsByUserId.values()).sort((first, second) => {
    const firstLabel = first.fullName ?? first.email ?? "";
    const secondLabel = second.fullName ?? second.email ?? "";
    return firstLabel.localeCompare(secondLabel);
  });

  const studentTargets: MessageContactsResponse["studentTargets"] = [];
  let groupTargets: MessageContactsResponse["groupTargets"] = [];
  if (context.activeWorkspace.workspace_type === "personal") {
    if (context.activeWorkspace.owner_profile_id === context.userId) {
      const { data: studentsData } = await admin
        .from("students")
        .select("id, first_name, last_name")
        .eq("org_id", context.activeWorkspace.id)
        .order("created_at", { ascending: false });

      const studentRows =
        (studentsData ?? []) as Array<{
          id: string;
          first_name: string;
          last_name: string | null;
        }>;
      const studentIds = studentRows.map((student) => student.id);
      const { data: studentAccountsData } = await admin
        .from("student_accounts")
        .select("student_id, user_id")
        .in("student_id", studentIds);
      const studentAccounts =
        (studentAccountsData ?? []) as Array<{ student_id: string; user_id: string }>;
      const studentEmails = await loadUserEmailsByIds(
        admin,
        studentAccounts.map((account) => account.user_id)
      );
      const studentEmailById = new Map<string, string | null>();
      studentAccounts.forEach((account) => {
        if (studentEmailById.has(account.student_id)) return;
        studentEmailById.set(
          account.student_id,
          studentEmails.get(account.user_id) ?? null
        );
      });

      studentTargets.push(
        ...studentRows.map((student) => ({
          studentId: student.id,
          studentName: `${student.first_name} ${student.last_name ?? ""}`.trim(),
          studentEmail: studentEmailById.get(student.id) ?? null,
          coachUserId: context.userId,
          coachName: context.profile.full_name ?? null,
          coachEmail: context.userEmail,
        }))
      );
    }
  } else {
    const { data: assignmentsData } = await admin
      .from("student_assignments")
      .select("student_id")
      .eq("coach_id", context.userId)
      .eq("org_id", context.activeWorkspace.id);

    const assignedStudentIds = ((assignmentsData ?? []) as Array<{ student_id: string }>).map(
      (assignment) => assignment.student_id
    );

    if (assignedStudentIds.length > 0) {
      const { data: studentsData } = await admin
        .from("students")
        .select("id, first_name, last_name")
        .in("id", assignedStudentIds)
        .order("created_at", { ascending: false });

      const studentRows =
        (studentsData ?? []) as Array<{
          id: string;
          first_name: string;
          last_name: string | null;
        }>;
      const { data: studentAccountsData } = await admin
        .from("student_accounts")
        .select("student_id, user_id")
        .in("student_id", assignedStudentIds);
      const studentAccounts =
        (studentAccountsData ?? []) as Array<{ student_id: string; user_id: string }>;
      const studentEmails = await loadUserEmailsByIds(
        admin,
        studentAccounts.map((account) => account.user_id)
      );
      const studentEmailById = new Map<string, string | null>();
      studentAccounts.forEach((account) => {
        if (studentEmailById.has(account.student_id)) return;
        studentEmailById.set(
          account.student_id,
          studentEmails.get(account.user_id) ?? null
        );
      });

      studentTargets.push(
        ...studentRows.map((student) => ({
          studentId: student.id,
          studentName: `${student.first_name} ${student.last_name ?? ""}`.trim(),
          studentEmail: studentEmailById.get(student.id) ?? null,
          coachUserId: context.userId,
          coachName: context.profile.full_name ?? null,
          coachEmail: context.userEmail,
        }))
      );
    }

    const { data: groupCoachRows } = await admin
      .from("org_group_coaches")
      .select("group_id")
      .eq("org_id", context.activeWorkspace.id)
      .eq("coach_id", context.userId);

    groupTargets = await buildGroupTargets(
      admin,
      ((groupCoachRows ?? []) as Array<{ group_id: string }>).map((row) => row.group_id)
    );
  }

  const [pendingIncomingCoachContactRequests, pendingOutgoingCoachContactRequests] =
    await Promise.all([
      buildCoachContactRequestDtos(
        admin,
        (incomingRequestsData.data ?? []) as Array<{
          id: string;
          requester_user_id: string;
          target_user_id: string;
          created_at: string;
        }>
      ),
      buildCoachContactRequestDtos(
        admin,
        (outgoingRequestsData.data ?? []) as Array<{
          id: string;
          requester_user_id: string;
          target_user_id: string;
          created_at: string;
        }>
      ),
    ]);

  const payload: MessageContactsResponse = {
    coachContacts,
    studentTargets,
    groupTargets,
    pendingIncomingCoachContactRequests,
    pendingOutgoingCoachContactRequests,
  };

  return messagesJson(payload);
}
