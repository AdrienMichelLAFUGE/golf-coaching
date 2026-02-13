import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { resolveEffectivePlanTier } from "@/lib/plans";
import { stripe } from "@/lib/stripe";
import {
  resolveAbsoluteUrl,
  resolveProPriceId,
  resolveSuccessUrl,
} from "@/lib/billing";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  interval: z.enum(["month", "year"]),
});

const allowedRoles = new Set(["owner", "coach"]);

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, checkoutSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const userEmail = userData.user?.email ?? null;

  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!allowedRoles.has(profile.role)) {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.checkout.denied",
      actorUserId: profile.id,
      message: "Checkout refuse: role non autorise.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select(
      "id, plan_tier, plan_tier_override, plan_tier_override_expires_at, workspace_type, owner_profile_id, stripe_customer_id"
    )
    .eq("workspace_type", "personal")
    .eq("owner_profile_id", profile.id)
    .maybeSingle();

  if (orgError || !org) {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.checkout.denied",
      actorUserId: profile.id,
      message: "Checkout refuse: organisation personnelle introuvable.",
    });
    return NextResponse.json({ error: "Organisation personnelle introuvable." }, { status: 403 });
  }

  if (org.owner_profile_id !== profile.id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.checkout.denied",
      actorUserId: profile.id,
      orgId: org.id,
      message: "Checkout refuse: utilisateur non proprietaire.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { tier: planTier, isOverrideActive } = resolveEffectivePlanTier(
    org.plan_tier,
    org.plan_tier_override,
    org.plan_tier_override_expires_at
  );
  if (planTier === "enterprise") {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.checkout.denied",
      actorUserId: profile.id,
      orgId: org.id,
      message: "Checkout refuse: plan enterprise.",
    });
    return NextResponse.json(
      { error: "Plan Entreprise : contacte le support." },
      { status: 409 }
    );
  }

  if (planTier === "pro") {
    if (isOverrideActive) {
      await recordActivity({
        admin,
        level: "warn",
        action: "payment.checkout.denied",
        actorUserId: profile.id,
        orgId: org.id,
        message: "Checkout refuse: plan Pro offert par admin.",
      });
      return NextResponse.json(
        { error: "Plan Pro offert par un admin." },
        { status: 409 }
      );
    }
    if (!org.stripe_customer_id) {
      await recordActivity({
        admin,
        level: "warn",
        action: "payment.checkout.denied",
        actorUserId: profile.id,
        orgId: org.id,
        message: "Checkout refuse: customer Stripe introuvable.",
      });
      return NextResponse.json(
        { error: "Abonnement introuvable. Contacte le support." },
        { status: 409 }
      );
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: resolveSuccessUrl(),
    });
    await recordActivity({
      admin,
      action: "payment.portal.success",
      actorUserId: profile.id,
      orgId: org.id,
      message: "Ouverture portail de facturation.",
    });
    return NextResponse.json({ url: portal.url, type: "portal" });
  }

  const priceId = resolveProPriceId(parsed.data.interval);
  if (!priceId) {
    await recordActivity({
      admin,
      level: "error",
      action: "payment.checkout.failed",
      actorUserId: profile.id,
      orgId: org.id,
      message: "Checkout impossible: price Stripe indisponible.",
    });
    return NextResponse.json({ error: "Plan Pro indisponible." }, { status: 500 });
  }

  if (!org.stripe_customer_id && !userEmail) {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.checkout.denied",
      actorUserId: profile.id,
      orgId: org.id,
      message: "Checkout refuse: email utilisateur introuvable.",
    });
    return NextResponse.json({ error: "Email utilisateur introuvable." }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: org.stripe_customer_id ?? undefined,
    customer_email: org.stripe_customer_id ? undefined : userEmail ?? undefined,
    success_url: resolveAbsoluteUrl("/app?billing=success"),
    cancel_url: resolveAbsoluteUrl(
      `/app/pricing?plan=pro&interval=${encodeURIComponent(parsed.data.interval)}&canceled=1`
    ),
    // Ensure subscription lifecycle events can be reliably mapped back to the org.
    subscription_data: {
      metadata: {
        org_id: org.id,
        owner_id: profile.id,
        plan: "pro",
      },
    },
    metadata: {
      org_id: org.id,
      owner_id: profile.id,
      plan: "pro",
    },
  });

  if (!session.url) {
    await recordActivity({
      admin,
      level: "error",
      action: "payment.checkout.failed",
      actorUserId: profile.id,
      orgId: org.id,
      message: "Checkout impossible: URL session Stripe manquante.",
    });
    return NextResponse.json({ error: "Session Stripe invalide." }, { status: 500 });
  }

  await recordActivity({
    admin,
    action: "payment.checkout.success",
    actorUserId: profile.id,
    orgId: org.id,
    entityType: "organization",
    entityId: org.id,
    message: "Session checkout Stripe creee.",
    metadata: {
      interval: parsed.data.interval,
    },
  });

  return NextResponse.json({ url: session.url });
}
