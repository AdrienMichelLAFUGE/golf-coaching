import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { shareId, decision } = parsed.data;

  const { data: share, error: shareError } = await supabase
    .from("student_shares")
    .select("id, status")
    .eq("id", shareId)
    .maybeSingle();

  if (shareError || !share) {
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
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    return NextResponse.json(
      { error: updateError.message ?? "Erreur de mise a jour." },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
