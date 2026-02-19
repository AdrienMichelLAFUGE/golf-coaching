import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { stripe } from "@/lib/stripe";
import {
  AI_CREDIT_TOPUP_OPTIONS_CENTS,
  resolveAiCreditTopupActions,
  resolveAbsoluteUrl,
  resolveAiCreditTopupPriceId,
} from "@/lib/billing";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const allowedRoles = new Set(["owner", "coach", "staff"]);
const allowedTopupAmounts = new Set<number>(AI_CREDIT_TOPUP_OPTIONS_CENTS);

const topupCheckoutSchema = z.object({
  amount_cents: z.number().int().positive(),
});

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const userEmail = userData.user?.email ?? "";

  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, org_id, ai_budget_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!allowedRoles.has(profile.role ?? "")) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const parsed = await parseRequestJson(request, topupCheckoutSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const amountCents = parsed.data.amount_cents;
  if (!allowedTopupAmounts.has(amountCents)) {
    return NextResponse.json(
      { error: "Montant de recharge non supporte." },
      { status: 422 }
    );
  }

  if (!profile.ai_budget_enabled) {
    return NextResponse.json(
      { error: "Recharge indisponible tant que le quota IA est desactive." },
      { status: 409 }
    );
  }

  const priceId = resolveAiCreditTopupPriceId(amountCents);
  const amountActions = resolveAiCreditTopupActions(amountCents);
  if (!priceId || amountActions <= 0) {
    await recordActivity({
      admin,
      level: "error",
      action: "payment.topup.checkout.failed",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "profile",
      entityId: userId,
      message: "Recharge IA impossible: price Stripe non configure.",
      metadata: {
        amountCents,
      },
    });
    return NextResponse.json(
      { error: "Recharge indisponible: configuration Stripe incomplete." },
      { status: 500 }
    );
  }

  const successUrl = resolveAbsoluteUrl(
    "/app/coach/parametres?topup=success&session_id={CHECKOUT_SESSION_ID}"
  );
  const cancelUrl = resolveAbsoluteUrl("/app/coach/parametres?topup=cancel");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        flow: "ai_credit_topup",
        org_id: profile.org_id ?? "",
        coach_id: profile.id,
        actor_user_id: userId,
        topup_cents: String(amountCents),
        topup_actions: String(amountActions),
      },
    });

    if (!session.url) {
      throw new Error("Session Stripe sans URL.");
    }

    await recordActivity({
      admin,
      action: "payment.topup.checkout.success",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "profile",
      entityId: userId,
      message: "Session checkout recharge IA creee (coach).",
      metadata: {
        amountCents,
        amountActions,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    await recordActivity({
      admin,
      level: "error",
      action: "payment.topup.checkout.failed",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "profile",
      entityId: userId,
      message:
        error instanceof Error ? error.message : "Creation checkout recharge impossible.",
      metadata: {
        amountCents,
      },
    });
    return NextResponse.json(
      { error: "Creation checkout recharge impossible." },
      { status: 500 }
    );
  }
}
