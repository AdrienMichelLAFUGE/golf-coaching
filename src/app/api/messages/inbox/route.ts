import { NextResponse } from "next/server";
import { loadMessageActorContext } from "@/lib/messages/access";
import { loadInbox } from "@/lib/messages/service";

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const inbox = await loadInbox(context.admin, context.userId);
  return NextResponse.json(inbox);
}
