import { NextResponse } from "next/server";

export const MESSAGES_NO_STORE_VALUE =
  "no-store, no-cache, must-revalidate, private";

export const messagesJson = (payload: unknown, init?: ResponseInit) => {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", MESSAGES_NO_STORE_VALUE);
  return response;
};
