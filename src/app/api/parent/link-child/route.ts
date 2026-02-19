import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-log";
import { loadParentAuthContext } from "@/lib/parent/access";

export async function POST(request: Request) {
  const authContext = await loadParentAuthContext(request);
  if (!authContext.context) {
    return NextResponse.json(
      { error: authContext.failure?.error ?? "Acces refuse." },
      { status: authContext.failure?.status ?? 403 }
    );
  }

  await recordActivity({
    admin: authContext.context.admin,
    level: "warn",
    action: "parent.child_link.legacy_blocked",
    actorUserId: authContext.context.parentUserId,
    message: "Rattachement parent legacy bloque: invitation V2 requise.",
    metadata: {
      parentUserId: authContext.context.parentUserId,
    },
  });

  return NextResponse.json(
    {
      error:
        "Le rattachement direct est desactive. Utilisez une invitation parent securisee.",
    },
    { status: 410 }
  );
}
