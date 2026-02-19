import { NextResponse } from "next/server";
import { z } from "zod";
import { loadParentAuthContext } from "@/lib/parent/access";
import { recordActivity } from "@/lib/activity-log";
import { formatZodError } from "@/lib/validation";

type Params = { params: { id: string } | Promise<{ id: string }> };

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const authContext = await loadParentAuthContext(request);
  if (!authContext.context) {
    return NextResponse.json(
      { error: authContext.failure?.error ?? "Acces refuse." },
      { status: authContext.failure?.status ?? 403 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await authContext.context.admin
    .from("parent_child_links")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: authContext.context.parentUserId,
    })
    .eq("parent_user_id", authContext.context.parentUserId)
    .eq("student_id", parsedParams.data.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Dissociation impossible." },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Lien parent-enfant introuvable." },
      { status: 404 }
    );
  }

  await recordActivity({
    admin: authContext.context.admin,
    action: "parent.child_link.revoked_by_parent",
    actorUserId: authContext.context.parentUserId,
    entityType: "student",
    entityId: parsedParams.data.id,
    message: "Dissociation enfant effectuee depuis l espace parent.",
    metadata: {
      studentId: parsedParams.data.id,
      parentUserId: authContext.context.parentUserId,
    },
  });

  return NextResponse.json({ ok: true });
}

