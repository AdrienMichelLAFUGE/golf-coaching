import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { shareId } = parsed.data;
  const { data: share, error: shareError } = await supabase
    .from("student_shares")
    .select("id, status")
    .eq("id", shareId)
    .maybeSingle();

  if (shareError || !share) {
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (share.status !== "active") {
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
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    return NextResponse.json(
      { error: updateError.message ?? "Erreur de mise a jour." },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: "Partage deja revoque." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
