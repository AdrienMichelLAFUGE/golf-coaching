import "server-only";

import type { MessageActorContext } from "@/lib/messages/access";
import type { MessageThreadKind } from "@/lib/messages/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const isOrgMessagingAdmin = (context: MessageActorContext) =>
  context.activeWorkspace?.workspace_type === "org" && context.orgMembershipRole === "admin";

export const isMinorThreadKind = (kind: MessageThreadKind) =>
  kind === "student_coach" || kind === "group" || kind === "group_info" || kind === "org_info";

export const insertMessageModerationAudit = async (input: {
  admin: AdminClient;
  workspaceOrgId: string;
  actorUserId: string;
  action: string;
  reportId?: string | null;
  threadId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  await input.admin.from("message_moderation_audit").insert([
    {
      workspace_org_id: input.workspaceOrgId,
      report_id: input.reportId ?? null,
      thread_id: input.threadId ?? null,
      actor_user_id: input.actorUserId,
      action: input.action,
      metadata: input.metadata ?? {},
    },
  ]);
};
