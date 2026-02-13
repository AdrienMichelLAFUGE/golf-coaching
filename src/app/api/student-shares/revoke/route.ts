import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const revokeSchema = z.object({
  shareId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, revokeSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.revoke.denied",
      message: "Revocation partage eleve refusee: session invalide.",
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { shareId } = parsed.data;
  const { data: share, error: shareError } = await supabase
    .from("student_shares")
    .select("id, status")
    .eq("id", shareId)
    .maybeSingle();

  if (shareError || !share) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.revoke.denied",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: "Revocation partage eleve refusee: invitation introuvable.",
    });
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (share.status !== "active") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.revoke.denied",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: "Revocation partage eleve refusee: partage non actif.",
    });
    return NextResponse.json({ error: "Partage non actif." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("student_shares")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("id", shareId)
    .eq("status", "active")
    .select("id, status")
    .maybeSingle();

  if (updateError) {
    const message = updateError.message?.toLowerCase() ?? "";
    if (message.includes("permission") || message.includes("rls")) {
      await recordActivity({
        admin,
        level: "warn",
        action: "student_share.revoke.denied",
        actorUserId: userId,
        entityType: "student_share",
        entityId: shareId,
        message: "Revocation partage eleve refusee: acces interdit.",
      });
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    await recordActivity({
      admin,
      level: "error",
      action: "student_share.revoke.failed",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: updateError.message ?? "Revocation partage eleve impossible.",
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
      action: "student_share.revoke.denied",
      actorUserId: userId,
      entityType: "student_share",
      entityId: shareId,
      message: "Revocation partage eleve refusee: deja revoque.",
    });
    return NextResponse.json({ error: "Partage deja revoque." }, { status: 409 });
  }

  await recordActivity({
    admin,
    action: "student_share.revoke.success",
    actorUserId: userId,
    entityType: "student_share",
    entityId: shareId,
    message: "Partage eleve revoque.",
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
