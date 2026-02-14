import { NextResponse } from "next/server";
import { isCoachLikeRole, loadMessageActorContext } from "@/lib/messages/access";
import { buildUnreadPreviews, loadInbox } from "@/lib/messages/service";
import type { MessageNotificationsResponse } from "@/lib/messages/types";

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const inbox = await loadInbox(context.admin, context.userId);
  const unreadPreviews = buildUnreadPreviews(inbox, context.userId);

  let pendingCoachContactRequestsCount = 0;
  if (isCoachLikeRole(context.profile.role)) {
    const { count } = await context.admin
      .from("message_coach_contact_requests")
      .select("id", { count: "exact", head: true })
      .eq("target_user_id", context.userId);

    pendingCoachContactRequestsCount = count ?? 0;
  }

  const payload: MessageNotificationsResponse = {
    unreadMessagesCount: inbox.unreadMessagesCount,
    unreadPreviews,
    pendingCoachContactRequestsCount,
  };

  return NextResponse.json(payload);
}
