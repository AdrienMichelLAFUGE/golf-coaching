import { messagesJson } from "@/lib/messages/http";
import {
  MessagingPolicySchema,
  UpdateMessagingPolicySchema,
} from "@/lib/messages/types";
import {
  loadMessagingPolicy,
  updateMessagingPolicy,
} from "@/lib/messages/policy";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadMessageActorContext } from "@/lib/messages/access";
import { recordActivity } from "@/lib/activity-log";

const canManageMessagingPolicy = (
  workspaceType: "personal" | "org",
  ownerProfileId: string | null,
  userId: string,
  orgMembershipRole: "admin" | "coach" | null
) => {
  if (workspaceType === "org") {
    return orgMembershipRole === "admin";
  }
  return ownerProfileId === userId;
};

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request, {
    skipCharterCheck: true,
  });
  if (response || !context) return response;

  if (
    !canManageMessagingPolicy(
      context.activeWorkspace.workspace_type,
      context.activeWorkspace.owner_profile_id,
      context.userId,
      context.orgMembershipRole
    )
  ) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const policy = await loadMessagingPolicy(context.admin, context.activeWorkspace.id);
  const parsed = MessagingPolicySchema.safeParse(policy);
  if (!parsed.success) {
    return messagesJson({ error: "Politique messagerie invalide." }, { status: 500 });
  }

  return messagesJson(parsed.data);
}

export async function PATCH(request: Request) {
  const parsedBody = await parseRequestJson(request, UpdateMessagingPolicySchema);
  if (!parsedBody.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request, {
    skipCharterCheck: true,
  });
  if (response || !context) return response;

  if (
    !canManageMessagingPolicy(
      context.activeWorkspace.workspace_type,
      context.activeWorkspace.owner_profile_id,
      context.userId,
      context.orgMembershipRole
    )
  ) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const { error } = await updateMessagingPolicy(
    context.admin,
    context.activeWorkspace.id,
    parsedBody.data
  );

  if (error) {
    return messagesJson(
      { error: error.message ?? "Mise a jour de la politique impossible." },
      { status: 400 }
    );
  }

  const policy = await loadMessagingPolicy(context.admin, context.activeWorkspace.id);

  await recordActivity({
    admin: context.admin,
    action: "messages.policy.updated",
    actorUserId: context.userId,
    orgId: context.activeWorkspace.id,
    entityType: "messages_policy",
    message: "Politique messagerie mise a jour.",
    metadata: {
      guardMode: policy.guardMode,
      retentionDays: policy.retentionDays,
      charterVersion: policy.charterVersion,
      sensitiveWordsCount: policy.sensitiveWords.length,
      supervisionEnabled: policy.supervisionEnabled,
    },
  });

  return messagesJson(policy);
}
