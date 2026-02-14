import { messagesJson } from "@/lib/messages/http";
import {
  AcceptMessagingCharterSchema,
  MessagingCharterStatusSchema,
} from "@/lib/messages/types";
import {
  acceptMessagingCharter,
  loadMessagingCharterStatus,
} from "@/lib/messages/charter";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";
import { loadMessageActorContext } from "@/lib/messages/access";

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request, {
    skipCharterCheck: true,
  });
  if (response || !context) return response;

  const charterStatus = await loadMessagingCharterStatus(
    context.admin,
    context.userId,
    context.activeWorkspace.id
  );

  const parsed = MessagingCharterStatusSchema.safeParse(charterStatus);
  if (!parsed.success) {
    return messagesJson({ error: "Charte messagerie invalide." }, { status: 500 });
  }

  return messagesJson(parsed.data);
}

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, AcceptMessagingCharterSchema);
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

  const charterStatus = await loadMessagingCharterStatus(
    context.admin,
    context.userId,
    context.activeWorkspace.id
  );

  if (parsedBody.data.charterVersion !== charterStatus.charterVersion) {
    return messagesJson(
      {
        error:
          "Version de charte obselete. Rechargez la page et acceptez la version courante.",
      },
      { status: 409 }
    );
  }

  const { error, acceptedAt } = await acceptMessagingCharter(
    context.admin,
    context.userId,
    context.activeWorkspace.id,
    charterStatus.charterVersion
  );

  if (error) {
    return messagesJson(
      { error: error.message ?? "Acceptation de la charte impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin: context.admin,
    action: "messages.charter.accepted",
    actorUserId: context.userId,
    orgId: context.activeWorkspace.id,
    entityType: "messages_charter",
    message: "Charte messagerie acceptee.",
    metadata: {
      charterVersion: charterStatus.charterVersion,
    },
  });

  return messagesJson({
    ok: true,
    charterVersion: charterStatus.charterVersion,
    acceptedAt,
  });
}
