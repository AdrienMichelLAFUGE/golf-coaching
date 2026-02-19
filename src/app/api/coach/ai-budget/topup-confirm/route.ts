import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { stripe } from "@/lib/stripe";
import { getAiBudgetMonthWindow } from "@/lib/ai/budget";
import { recordActivity } from "@/lib/activity-log";
import { resolveAiCreditTopupActions } from "@/lib/billing";

export const runtime = "nodejs";

const allowedRoles = new Set(["owner", "coach", "staff"]);

const topupConfirmSchema = z.object({
  session_id: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!allowedRoles.has(profile.role ?? "")) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const parsed = await parseRequestJson(request, topupConfirmSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const sessionId = parsed.data.session_id.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Session Stripe invalide." }, { status: 422 });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Session Stripe introuvable." }, { status: 404 });
  }

  if (session.metadata?.flow !== "ai_credit_topup") {
    return NextResponse.json({ error: "Session non compatible recharge IA." }, { status: 422 });
  }

  const coachId = session.metadata?.coach_id ?? null;
  const orgId = session.metadata?.org_id ?? profile.org_id ?? null;
  const topupCents = Number(session.metadata?.topup_cents ?? 0);
  const metadataTopupActions = Number(session.metadata?.topup_actions ?? 0);
  const topupActions =
    Number.isFinite(metadataTopupActions) && metadataTopupActions > 0
      ? Math.round(metadataTopupActions)
      : resolveAiCreditTopupActions(Math.round(topupCents));
  if (!coachId || coachId !== userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }
  if (!Number.isFinite(topupCents) || topupCents <= 0 || topupActions <= 0) {
    return NextResponse.json({ error: "Metadata recharge invalide." }, { status: 422 });
  }

  if (session.payment_status !== "paid") {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.topup.confirm.pending",
      actorUserId: userId,
      orgId,
      entityType: "profile",
      entityId: coachId,
      message: "Confirmation recharge en attente de paiement.",
      metadata: {
        checkoutSessionId: session.id ?? sessionId,
        paymentStatus: session.payment_status ?? null,
      },
    });
    return NextResponse.json(
      {
        status: "pending",
        amount_cents: Math.round(topupCents),
        amount_actions: topupActions,
      },
      { status: 409 }
    );
  }

  const topupReference = `stripe_session:${session.id ?? sessionId}`;
  const { data: existingTopup } = await admin
    .from("ai_credit_topups")
    .select("id")
    .eq("profile_id", coachId)
    .eq("note", topupReference)
    .maybeSingle();
  if (existingTopup) {
    return NextResponse.json({
      status: "already_credited",
      amount_cents: Math.round(topupCents),
      amount_actions: topupActions,
    });
  }

  const { monthKey } = getAiBudgetMonthWindow();
  const { error: topupError } = await admin.from("ai_credit_topups").insert([
    {
      profile_id: coachId,
      amount_cents: topupActions,
      month_key: monthKey,
      note: topupReference,
      created_by: userId,
    },
  ]);

  if (topupError) {
    await recordActivity({
      admin,
      level: "error",
      action: "payment.topup.confirm.failed",
      actorUserId: userId,
      orgId,
      entityType: "profile",
      entityId: coachId,
      message: topupError.message ?? "Credit recharge impossible.",
      metadata: {
        checkoutSessionId: session.id ?? sessionId,
        amountCents: Math.round(topupCents),
        amountActions: topupActions,
      },
    });
    return NextResponse.json(
      { error: topupError.message ?? "Credit recharge impossible." },
      { status: 500 }
    );
  }

  await recordActivity({
    admin,
    action: "payment.topup.confirm.success",
    actorUserId: userId,
    orgId,
    entityType: "profile",
    entityId: coachId,
    message: "Recharge IA creditee apres retour checkout.",
    metadata: {
      checkoutSessionId: session.id ?? sessionId,
      amountCents: Math.round(topupCents),
      amountActions: topupActions,
    },
  });

  return NextResponse.json({
    status: "credited",
    amount_cents: Math.round(topupCents),
    amount_actions: topupActions,
  });
}
