import { loadMessageActorContext } from "@/lib/messages/access";
import { messagesJson } from "@/lib/messages/http";
import { loadInbox } from "@/lib/messages/service";

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const inbox = await loadInbox(context.admin, context.userId, context.profile.role);
  return messagesJson(inbox);
}