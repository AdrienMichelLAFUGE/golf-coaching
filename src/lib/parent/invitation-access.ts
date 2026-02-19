import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";

type ParentInvitationActorRole = "owner" | "coach" | "staff" | "student";

type ActorProfileRow = {
  id: string;
  role: string | null;
};

type LoadParentInvitationActorResult =
  | {
      allowed: true;
      actorRole: ParentInvitationActorRole;
    }
  | {
      allowed: false;
      actorRole: null;
    };

const isCoachLikeRole = (value: string | null | undefined): value is "owner" | "coach" | "staff" =>
  value === "owner" || value === "coach" || value === "staff";

const isStudentRole = (value: string | null | undefined): value is "student" =>
  value === "student";

export const loadParentInvitationActor = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  studentId: string
): Promise<LoadParentInvitationActorResult> => {
  const { data: profileData } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  const profile = (profileData as ActorProfileRow | null) ?? null;
  if (!profile?.id || !profile.role) {
    return { allowed: false, actorRole: null };
  }

  if (isCoachLikeRole(profile.role)) {
    const canAccess = await canCoachLikeAccessStudent(admin, userId, studentId);
    if (!canAccess) {
      return { allowed: false, actorRole: null };
    }
    return { allowed: true, actorRole: profile.role };
  }

  if (isStudentRole(profile.role)) {
    const { data: linkData } = await admin
      .from("student_accounts")
      .select("student_id")
      .eq("user_id", userId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!(linkData as { student_id: string } | null)?.student_id) {
      return { allowed: false, actorRole: null };
    }

    return { allowed: true, actorRole: "student" };
  }

  return { allowed: false, actorRole: null };
};
