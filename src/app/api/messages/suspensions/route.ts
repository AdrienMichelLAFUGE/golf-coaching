import { messagesJson } from "@/lib/messages/http";
import { loadMessageActorContext } from "@/lib/messages/access";
import { isOrgMessagingAdmin } from "@/lib/messages/moderation";
import {
  ManageMessageSuspensionSchema,
  MessageSuspensionsResponseSchema,
} from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { listActiveMessagingSuspensions } from "@/lib/messages/suspensions";
import { recordActivity } from "@/lib/activity-log";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const ensureTargetUserBelongsToOrg = async (
  admin: AdminClient,
  orgId: string,
  userId: string
) => {
  const { data: profileRow } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profileRow) return null;

  const role = (profileRow as { role: "owner" | "coach" | "staff" | "student" | null }).role;
  if (!role) return null;

  if (role === "student") {
    const { data: studentAccountRows } = await admin
      .from("student_accounts")
      .select("student_id")
      .eq("user_id", userId);

    const studentIds = Array.from(
      new Set(
        ((studentAccountRows ?? []) as Array<{ student_id: string }>)
          .map((row) => row.student_id)
          .filter((value) => value.length > 0)
      )
    );

    if (studentIds.length === 0) return null;

    const { data: studentInOrg } = await admin
      .from("students")
      .select("id")
      .eq("org_id", orgId)
      .in("id", studentIds)
      .limit(1)
      .maybeSingle();

    if (!studentInOrg) return null;

    return { role };
  }

  const { data: membershipRow } = await admin
    .from("org_memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!membershipRow) return null;
  return { role };
};

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request, {
    skipCharterCheck: true,
    skipSuspensionCheck: true,
  });
  if (response || !context) return response;

  if (!isOrgMessagingAdmin(context)) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const suspensions = await listActiveMessagingSuspensions(
    context.admin,
    context.activeWorkspace.id
  );

  return messagesJson(MessageSuspensionsResponseSchema.parse({ suspensions }));
}

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, ManageMessageSuspensionSchema);
  if (!parsedBody.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request, {
    skipCharterCheck: true,
    skipSuspensionCheck: true,
  });
  if (response || !context) return response;

  if (!isOrgMessagingAdmin(context)) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const targetUserId = parsedBody.data.userId;
  if (targetUserId === context.userId) {
    return messagesJson(
      { error: "Auto-suspension impossible." },
      { status: 409 }
    );
  }

  const targetUser = await ensureTargetUserBelongsToOrg(
    context.admin,
    context.activeWorkspace.id,
    targetUserId
  );
  if (!targetUser) {
    return messagesJson({ error: "Utilisateur introuvable dans la structure." }, { status: 404 });
  }

  if (parsedBody.data.action === "lift") {
    const now = new Date().toISOString();
    const { error: liftError } = await context.admin
      .from("message_user_suspensions")
      .update({
        lifted_at: now,
        lifted_by: context.userId,
      })
      .eq("org_id", context.activeWorkspace.id)
      .eq("user_id", targetUserId)
      .is("lifted_at", null);

    if (liftError) {
      return messagesJson(
        { error: liftError.message ?? "Levee suspension impossible." },
        { status: 400 }
      );
    }

    await recordActivity({
      admin: context.admin,
      action: "messages.suspension.lifted",
      actorUserId: context.userId,
      orgId: context.activeWorkspace.id,
      entityType: "profile",
      entityId: targetUserId,
      message: "Suspension messagerie levee.",
    });
  } else {
    const suspendedUntil = parsedBody.data.suspendedUntil ?? null;

    const { data: activeSuspension } = await context.admin
      .from("message_user_suspensions")
      .select("id")
      .eq("org_id", context.activeWorkspace.id)
      .eq("user_id", targetUserId)
      .is("lifted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSuspension) {
      const { error: updateError } = await context.admin
        .from("message_user_suspensions")
        .update({
          reason: parsedBody.data.reason.trim(),
          suspended_until: suspendedUntil,
          created_by: context.userId,
          lifted_at: null,
          lifted_by: null,
        })
        .eq("id", (activeSuspension as { id: string }).id);

      if (updateError) {
        return messagesJson(
          { error: updateError.message ?? "Suspension messagerie impossible." },
          { status: 400 }
        );
      }
    } else {
      const { error: insertError } = await context.admin
        .from("message_user_suspensions")
        .insert([
          {
            org_id: context.activeWorkspace.id,
            user_id: targetUserId,
            reason: parsedBody.data.reason.trim(),
            suspended_until: suspendedUntil,
            created_by: context.userId,
          },
        ]);

      if (insertError) {
        return messagesJson(
          { error: insertError.message ?? "Suspension messagerie impossible." },
          { status: 400 }
        );
      }
    }

    await recordActivity({
      admin: context.admin,
      action: "messages.suspension.created",
      actorUserId: context.userId,
      orgId: context.activeWorkspace.id,
      entityType: "profile",
      entityId: targetUserId,
      message: "Suspension messagerie appliquee.",
      metadata: {
        reason: parsedBody.data.reason,
        suspendedUntil,
      },
    });
  }

  const suspensions = await listActiveMessagingSuspensions(
    context.admin,
    context.activeWorkspace.id
  );

  return messagesJson(MessageSuspensionsResponseSchema.parse({ suspensions }));
}
