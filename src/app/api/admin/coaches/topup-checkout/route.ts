import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { assertBackofficeUnlocked } from "@/lib/backoffice-auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { stripe } from "@/lib/stripe";
import {
  AI_CREDIT_TOPUP_OPTIONS_CENTS,
  resolveAbsoluteUrl,
  resolveAiCreditTopupPriceId,
} from "@/lib/billing";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const topupCheckoutSchema = z.object({
  orgId: z.string().min(1),
  coachId: z.string().min(1),
  amount_cents: z.number().int().positive(),
});

const allowedTopupAmounts = new Set<number>(AI_CREDIT_TOPUP_OPTIONS_CENTS);

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userEmail = userData.user?.email ?? "";
  const userId = userData.user?.id ?? null;
  if (userError || !isAdminEmail(userEmail)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  const backofficeError = assertBackofficeUnlocked(request);
  if (backofficeError) {
    return {
      error: backofficeError,
    };
  }

  return {
    admin: createSupabaseAdminClient(),
    userId,
    userEmail,
  };
};

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, topupCheckoutSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const orgId = parsed.data.orgId.trim();
  const coachId = parsed.data.coachId.trim();
  const amountCents = parsed.data.amount_cents;

  if (!allowedTopupAmounts.has(amountCents)) {
    return NextResponse.json(
      { error: "Montant de recharge non supporte." },
      { status: 422 }
    );
  }

  const priceId = resolveAiCreditTopupPriceId(amountCents);
  if (!priceId) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "payment.topup.checkout.failed",
      actorUserId: auth.userId,
      orgId,
      entityType: "profile",
      entityId: coachId,
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

  const { data: organization, error: orgError } = await auth.admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !organization) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 });
  }

  const { data: coachProfile, error: coachError } = await auth.admin
    .from("profiles")
    .select("id, role")
    .eq("id", coachId)
    .maybeSingle();

  if (coachError || !coachProfile) {
    return NextResponse.json({ error: "Coach introuvable." }, { status: 404 });
  }

  if (coachProfile.role === "student") {
    return NextResponse.json(
      { error: "Recharge refusee pour un profil eleve." },
      { status: 403 }
    );
  }

  let coachAllowedForOrg = organization.owner_profile_id === coachId;
  if (!coachAllowedForOrg) {
    const { data: membership } = await auth.admin
      .from("org_memberships")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("user_id", coachId)
      .maybeSingle();
    coachAllowedForOrg = Boolean(membership?.id && membership.status === "active");
  }

  if (!coachAllowedForOrg) {
    return NextResponse.json(
      { error: "Ce coach n est pas actif sur ce workspace." },
      { status: 403 }
    );
  }

  const successUrl = resolveAbsoluteUrl(
    `/app/admin/coaches?topup=success&coachId=${encodeURIComponent(coachId)}`
  );
  const cancelUrl = resolveAbsoluteUrl(
    `/app/admin/coaches?topup=cancel&coachId=${encodeURIComponent(coachId)}`
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: auth.userEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        flow: "ai_credit_topup",
        org_id: orgId,
        coach_id: coachId,
        actor_user_id: auth.userId ?? "",
        topup_cents: String(amountCents),
      },
    });

    if (!session.url) {
      throw new Error("Session Stripe sans URL.");
    }

    await recordActivity({
      admin: auth.admin,
      action: "payment.topup.checkout.success",
      actorUserId: auth.userId,
      orgId,
      entityType: "profile",
      entityId: coachId,
      message: "Session checkout recharge IA creee.",
      metadata: {
        amountCents,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "payment.topup.checkout.failed",
      actorUserId: auth.userId,
      orgId,
      entityType: "profile",
      entityId: coachId,
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

