import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const respondSchema = z.object({
  shareId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, respondSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.respond.denied",
      message: "Reponse partage eleve refusee: session invalide.",
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { shareId, decision } = parsed.data;

  const { data: share, error: shareError } = await supabase
    .from("student_shares")
    .select("id, status")
    .eq("id", shareId)
    .maybeSingle();

  if (shareError || !share) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.respond.denied",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: "Reponse partage eleve refusee: invitation introuvable.",
    });
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  const now = new Date().toISOString();
  let updatePayload: Record<string, string | null> | null = null;

  if (share.status === "pending_coach") {
    updatePayload =
      decision === "accept"
        ? {
            status: "pending_student",
            coach_accepted_at: now,
            viewer_id: userId,
            updated_at: now,
          }
        : {
            status: "rejected_coach",
            coach_declined_at: now,
            viewer_id: userId,
            updated_at: now,
          };
  } else if (share.status === "pending_student") {
    updatePayload =
      decision === "accept"
        ? {
            status: "active",
            student_accepted_at: now,
            updated_at: now,
          }
        : {
            status: "rejected_student",
            student_declined_at: now,
            updated_at: now,
          };
  }

  if (!updatePayload) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.respond.denied",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: "Reponse partage eleve refusee: invitation deja traitee.",
    });
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("student_shares")
    .update(updatePayload)
    .eq("id", shareId)
    .eq("status", share.status)
    .select("id, status")
    .maybeSingle();

  if (updateError) {
    const message = updateError.message?.toLowerCase() ?? "";
    if (message.includes("permission") || message.includes("rls")) {
      await recordActivity({
        admin,
        level: "warn",
        action: "student_share.respond.denied",
        actorUserId: userId,
        entityType: "student_share",
        entityId: shareId,
        message: "Reponse partage eleve refusee: acces interdit.",
      });
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    await recordActivity({
      admin,
      level: "error",
      action: "student_share.respond.failed",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: updateError.message ?? "Mise a jour partage eleve impossible.",
    });
    return NextResponse.json(
      { error: updateError.message ?? "Erreur de mise a jour." },
      { status: 500 }
    );
  }

  if (!updated) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.respond.denied",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: "Reponse partage eleve refusee: invitation deja traitee.",
    });
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 409 });
  }

  await recordActivity({
    admin,
    action:
      decision === "accept" ? "student_share.respond.accepted" : "student_share.respond.rejected",
    actorUserId: userId,
    entityType: "student_share",
    entityId: shareId,
    message:
      decision === "accept"
        ? "Invitation partage eleve acceptee."
        : "Invitation partage eleve rejetee.",
    metadata: {
      status: updated.status,
    },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
