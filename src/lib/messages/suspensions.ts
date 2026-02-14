import "server-only";

import type { MessageSuspensionDto } from "@/lib/messages/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SuspensionRow = {
  id: string;
  org_id: string;
  user_id: string;
  reason: string;
  suspended_until: string | null;
  created_at: string;
  created_by: string | null;
};

export const loadActiveMessagingSuspension = async (
  admin: AdminClient,
  orgId: string,
  userId: string
): Promise<{
  id: string;
  reason: string;
  suspendedUntil: string | null;
  createdAt: string;
} | null> => {
  const { data } = await admin
    .from("message_user_suspensions")
    .select("id, reason, suspended_until, created_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("lifted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const now = Date.now();
  const rows =
    ((data ?? []) as Array<{
      id: string;
      reason: string;
      suspended_until: string | null;
      created_at: string;
    }>) ?? [];

  const activeRow = rows.find((row) => {
    if (!row.suspended_until) return true;
    return Number.isFinite(Date.parse(row.suspended_until)) && Date.parse(row.suspended_until) > now;
  });

  if (!activeRow) return null;

  return {
    id: activeRow.id,
    reason: activeRow.reason,
    suspendedUntil: activeRow.suspended_until,
    createdAt: activeRow.created_at,
  };
};

const loadProfilesMap = async (admin: AdminClient, userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<
      string,
      {
        full_name: string | null;
        role: "owner" | "coach" | "staff" | "student" | null;
      }
    >();
  }

  const { data } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .in("id", uniqueUserIds);

  const map = new Map<
    string,
    {
      full_name: string | null;
      role: "owner" | "coach" | "staff" | "student" | null;
    }
  >();

  (
    (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      role: "owner" | "coach" | "staff" | "student" | null;
    }>
  ).forEach((profile) => {
    map.set(profile.id, {
      full_name: profile.full_name,
      role: profile.role,
    });
  });

  return map;
};

export const listActiveMessagingSuspensions = async (
  admin: AdminClient,
  orgId: string
): Promise<MessageSuspensionDto[]> => {
  const { data } = await admin
    .from("message_user_suspensions")
    .select("id, org_id, user_id, reason, suspended_until, created_at, created_by")
    .eq("org_id", orgId)
    .is("lifted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const now = Date.now();
  const rows = ((data ?? []) as SuspensionRow[]).filter((row) => {
    if (!row.suspended_until) return true;
    return Number.isFinite(Date.parse(row.suspended_until)) && Date.parse(row.suspended_until) > now;
  });

  const userIds = rows.flatMap((row) => [row.user_id, row.created_by].filter(Boolean) as string[]);
  const profilesMap = await loadProfilesMap(admin, userIds);

  return rows.map((row) => {
    const userProfile = profilesMap.get(row.user_id);
    const actorProfile = row.created_by ? profilesMap.get(row.created_by) : null;

    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      userName: userProfile?.full_name ?? null,
      userRole: userProfile?.role ?? null,
      reason: row.reason,
      suspendedUntil: row.suspended_until,
      createdAt: row.created_at,
      createdBy: row.created_by,
      createdByName: actorProfile?.full_name ?? null,
    };
  });
};
