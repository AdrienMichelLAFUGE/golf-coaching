import { NextResponse } from "next/server";
import { isCoachLikeRole, loadMessageActorContext } from "@/lib/messages/access";
import {
  buildCoachContactRequestDtos,
  buildUnreadPreviews,
  loadInbox,
} from "@/lib/messages/service";
import type { MessageNotificationsResponse } from "@/lib/messages/types";

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const inbox = await loadInbox(context.admin, context.userId);
  const unreadPreviews = buildUnreadPreviews(inbox, context.userId);

  let pendingCoachContactRequestsCount = 0;
  let pendingCoachContactRequests: MessageNotificationsResponse["pendingCoachContactRequests"] =
    [];

  if (isCoachLikeRole(context.profile.role)) {
    const [{ count }, { data: rows }] = await Promise.all([
      context.admin
        .from("message_coach_contact_requests")
        .select("id", { count: "exact", head: true })
        .eq("target_user_id", context.userId),
      context.admin
        .from("message_coach_contact_requests")
        .select("id, requester_user_id, target_user_id, created_at")
        .eq("target_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    pendingCoachContactRequestsCount = count ?? 0;
    pendingCoachContactRequests = await buildCoachContactRequestDtos(
      context.admin,
      (rows ?? []) as Array<{
        id: string;
        requester_user_id: string;
        target_user_id: string;
        created_at: string;
      }>
    );
  }

  const payload: MessageNotificationsResponse = {
    unreadMessagesCount: inbox.unreadMessagesCount,
    unreadPreviews,
    pendingCoachContactRequestsCount,
    pendingCoachContactRequests,
  };

  return NextResponse.json(payload);
}
