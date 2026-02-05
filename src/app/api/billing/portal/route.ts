import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { resolveEffectivePlanTier } from "@/lib/plans";
import { stripe } from "@/lib/stripe";
import { resolveSuccessUrl } from "@/lib/billing";

export const runtime = "nodejs";

const allowedRoles = new Set(["owner", "coach"]);

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;

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
    return NextResponse.json({ error: "Organisation personnelle introuvable." }, { status: 403 });
  }

  if (org.owner_profile_id !== profile.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { tier: planTier, isOverrideActive } = resolveEffectivePlanTier(
    org.plan_tier,
    org.plan_tier_override,
    org.plan_tier_override_expires_at
  );
  if (planTier === "enterprise") {
    return NextResponse.json(
      { error: "Plan Entreprise : contacte le support." },
      { status: 409 }
    );
  }
  if (planTier === "pro" && isOverrideActive) {
    return NextResponse.json(
      { error: "Plan Pro offert par un admin." },
      { status: 409 }
    );
  }

  if (!org.stripe_customer_id) {
    return NextResponse.json({ error: "Aucun abonnement Stripe actif." }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: resolveSuccessUrl(),
  });

  return NextResponse.json({ url: portal.url });
}
