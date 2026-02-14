import "server-only";

import type { MessageReportDto } from "@/lib/messages/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type MessageReportRow = {
  id: string;
  workspace_org_id: string;
  thread_id: string;
  message_id: number | null;
  reported_by: string | null;
  reason: string;
  details: string | null;
  status: "open" | "in_review" | "resolved";
  freeze_applied: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export const mapMessageReportRowsToDtos = async (
  admin: AdminClient,
  rows: MessageReportRow[]
): Promise<MessageReportDto[]> => {
  if (rows.length === 0) return [];

  const profileIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.reported_by, row.resolved_by])
        .filter((value): value is string => typeof value === "string")
    )
  );
  const threadIds = Array.from(new Set(rows.map((row) => row.thread_id)));

  const [{ data: profileRows }, { data: threadRows }] = await Promise.all([
    profileIds.length > 0
      ? admin.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
    threadIds.length > 0
      ? admin.from("message_threads").select("id, frozen_at, frozen_reason").in("id", threadIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            frozen_at: string | null;
            frozen_reason: string | null;
          }>,
        }),
  ]);

  const profileById = new Map<string, { full_name: string | null }>();
  ((profileRows ?? []) as Array<{ id: string; full_name: string | null }>).forEach((row) => {
    profileById.set(row.id, { full_name: row.full_name });
  });

  const threadById = new Map<
    string,
    { frozen_at: string | null; frozen_reason: string | null }
  >();
  (
    (threadRows ?? []) as Array<{
      id: string;
      frozen_at: string | null;
      frozen_reason: string | null;
    }>
  ).forEach((row) => {
    threadById.set(row.id, {
      frozen_at: row.frozen_at,
      frozen_reason: row.frozen_reason,
    });
  });

  return rows.map((row) => {
    const thread = threadById.get(row.thread_id);
    return {
      id: row.id,
      workspaceOrgId: row.workspace_org_id,
      threadId: row.thread_id,
      messageId: row.message_id,
      reportedBy: row.reported_by,
      reportedByName: row.reported_by ? profileById.get(row.reported_by)?.full_name ?? null : null,
      reason: row.reason,
      details: row.details,
      status: row.status,
      freezeApplied: row.freeze_applied,
      frozenAt: thread?.frozen_at ?? null,
      frozenReason: thread?.frozen_reason ?? null,
      resolvedBy: row.resolved_by,
      resolvedByName: row.resolved_by ? profileById.get(row.resolved_by)?.full_name ?? null : null,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies MessageReportDto;
  });
};
