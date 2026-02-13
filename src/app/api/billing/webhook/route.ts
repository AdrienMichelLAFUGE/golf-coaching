import { NextResponse } from "next/server";
import crypto from "crypto";
import type Stripe from "stripe";
import { env } from "@/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { computeAccess, isProPriceId } from "@/lib/billing";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

type OrganizationRow = {
  id: string;
  plan_tier: string | null;
  workspace_type: string | null;
  owner_profile_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_status: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean | null;
};

const ORG_SELECT =
  "id, plan_tier, workspace_type, owner_profile_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, stripe_current_period_end, stripe_cancel_at_period_end";

const logStripeEvent = (eventId: string, eventType: string, orgId?: string | null) => {
  if (orgId) {
    console.info(`[stripe] ${eventType} ${eventId} org=${orgId}`);
    return;
  }
  console.info(`[stripe] ${eventType} ${eventId}`);
};

const toIso = (timestamp?: number | null) =>
  timestamp ? new Date(timestamp * 1000).toISOString() : null;

const getCustomerId = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) => {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
};

const getSubscriptionId = (
  subscription: string | Stripe.Subscription | null | undefined
) => {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
};

const resolveOrg = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  identifiers: { customerId?: string | null; orgId?: string | null; subscriptionId?: string | null }
) => {
  if (identifiers.customerId) {
    const { data } = await admin
      .from("organizations")
      .select(ORG_SELECT)
      .eq("stripe_customer_id", identifiers.customerId)
      .maybeSingle();
    if (data) return data as OrganizationRow;
  }

  if (identifiers.orgId) {
    const { data } = await admin
      .from("organizations")
      .select(ORG_SELECT)
      .eq("id", identifiers.orgId)
      .maybeSingle();
    if (data) return data as OrganizationRow;
  }

  if (identifiers.subscriptionId) {
    const { data } = await admin
      .from("organizations")
      .select(ORG_SELECT)
      .eq("stripe_subscription_id", identifiers.subscriptionId)
      .maybeSingle();
    if (data) return data as OrganizationRow;
  }

  return null;
};

const syncSubscriptionToOrg = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  org: OrganizationRow,
  subscription: Stripe.Subscription
) => {
  const priceId =
    subscription.items.data.find((item) => isProPriceId(item.price?.id))?.price?.id ??
    null;
  const status = subscription.status ?? null;
  const currentPeriodEnd = toIso(subscription.current_period_end);
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const customerId = getCustomerId(subscription.customer);

  const access = isProPriceId(priceId)
    ? computeAccess({
        stripe_status: status,
        stripe_current_period_end: currentPeriodEnd,
        stripe_cancel_at_period_end: cancelAtPeriodEnd,
        stripe_price_id: priceId,
      })
    : { planTier: "free", paymentIssue: false };

  const updates: Partial<OrganizationRow> & { plan_tier?: string } = {
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_status: status,
    stripe_current_period_end: currentPeriodEnd,
    stripe_cancel_at_period_end: cancelAtPeriodEnd,
  };

  if (customerId && org.stripe_customer_id !== customerId) {
    updates.stripe_customer_id = customerId;
  }

  if (org.workspace_type === "personal" && org.plan_tier !== "enterprise") {
    updates.plan_tier = access.planTier;
  }

  const { error } = await admin.from("organizations").update(updates).eq("id", org.id);
  if (error) {
    throw new Error(error.message);
  }
};

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.webhook.denied",
      source: "stripe_webhook",
      message: "Webhook Stripe refuse: signature manquante.",
    });
    return NextResponse.json({ error: "Signature Stripe manquante." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    await recordActivity({
      admin,
      level: "warn",
      action: "payment.webhook.denied",
      source: "stripe_webhook",
      message: "Webhook Stripe refuse: signature invalide.",
    });
    return NextResponse.json({ error: "Signature Stripe invalide." }, { status: 400 });
  }

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  const { data: existing } = await admin
    .from("stripe_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existing) {
    logStripeEvent(event.id, event.type);
    await recordActivity({
      admin,
      action: "payment.webhook.duplicate",
      source: "stripe_webhook",
      message: "Webhook Stripe deja traite.",
      metadata: {
        eventId: event.id,
        eventType: event.type,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const { error: insertError } = await admin.from("stripe_events").insert([
    {
      event_id: event.id,
      type: event.type,
      created: toIso(event.created),
      payload_hash: payloadHash,
    },
  ]);

  if (insertError) {
    if (insertError.code === "23505") {
      logStripeEvent(event.id, event.type);
      await recordActivity({
        admin,
        action: "payment.webhook.duplicate",
        source: "stripe_webhook",
        message: "Webhook Stripe deja traite.",
        metadata: {
          eventId: event.id,
          eventType: event.type,
        },
      });
      return NextResponse.json({ ok: true });
    }
    await recordActivity({
      admin,
      level: "error",
      action: "payment.webhook.failed",
      source: "stripe_webhook",
      message: insertError.message ?? "Enregistrement webhook Stripe impossible.",
      metadata: {
        eventId: event.id,
        eventType: event.type,
      },
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = getCustomerId(session.customer);
        const orgId = session.metadata?.org_id ?? null;
        const subscriptionId = getSubscriptionId(session.subscription);
        const org = await resolveOrg(admin, {
          customerId,
          orgId,
          subscriptionId,
        });
        if (org && customerId) {
          await stripe.customers.update(customerId, {
            metadata: {
              org_id: org.id,
              owner_id: org.owner_profile_id ?? "",
            },
          });
          const updates: Partial<OrganizationRow> = {
            stripe_customer_id: customerId,
          };
          if (subscriptionId) {
            updates.stripe_subscription_id = subscriptionId;
          }
          await admin.from("organizations").update(updates).eq("id", org.id);

          // In local/dev setups it's common to only forward checkout events.
          // Sync here so a successful checkout immediately upgrades the plan.
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await syncSubscriptionToOrg(admin, org, subscription);
          }
          logStripeEvent(event.id, event.type, org.id);
          await recordActivity({
            admin,
            action: "payment.webhook.success",
            source: "stripe_webhook",
            orgId: org.id,
            entityType: "organization",
            entityId: org.id,
            message: "Webhook checkout traite.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
        } else {
          logStripeEvent(event.id, event.type);
          await recordActivity({
            admin,
            level: "warn",
            action: "payment.webhook.unlinked",
            source: "stripe_webhook",
            message: "Webhook checkout recu sans organisation resolue.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = getCustomerId(subscription.customer);
        const orgId = subscription.metadata?.org_id ?? null;
        const org = await resolveOrg(admin, {
          customerId,
          orgId,
          subscriptionId: subscription.id,
        });
        if (org) {
          await syncSubscriptionToOrg(admin, org, subscription);
          logStripeEvent(event.id, event.type, org.id);
          await recordActivity({
            admin,
            action: "payment.webhook.success",
            source: "stripe_webhook",
            orgId: org.id,
            entityType: "organization",
            entityId: org.id,
            message: "Webhook abonnement traite.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
        } else {
          logStripeEvent(event.id, event.type);
          await recordActivity({
            admin,
            level: "warn",
            action: "payment.webhook.unlinked",
            source: "stripe_webhook",
            message: "Webhook abonnement recu sans organisation resolue.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getSubscriptionId(invoice.subscription);
        if (!subscriptionId) {
          logStripeEvent(event.id, event.type);
          await recordActivity({
            admin,
            level: "warn",
            action: "payment.webhook.unlinked",
            source: "stripe_webhook",
            message: "Webhook facture recu sans abonnement.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
          break;
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId = getCustomerId(subscription.customer);
        const orgId = subscription.metadata?.org_id ?? null;
        const org = await resolveOrg(admin, {
          customerId,
          orgId,
          subscriptionId: subscription.id,
        });
        if (org) {
          await syncSubscriptionToOrg(admin, org, subscription);
          logStripeEvent(event.id, event.type, org.id);
          await recordActivity({
            admin,
            level: event.type === "invoice.payment_failed" ? "warn" : "info",
            action:
              event.type === "invoice.payment_failed"
                ? "payment.invoice.failed"
                : "payment.invoice.success",
            source: "stripe_webhook",
            orgId: org.id,
            entityType: "organization",
            entityId: org.id,
            message:
              event.type === "invoice.payment_failed"
                ? "Paiement facture echoue."
                : "Paiement facture confirme.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
        } else {
          logStripeEvent(event.id, event.type);
          await recordActivity({
            admin,
            level: "warn",
            action: "payment.webhook.unlinked",
            source: "stripe_webhook",
            message: "Webhook facture recu sans organisation resolue.",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });
        }
        break;
      }
      case "checkout.session.async_payment_failed": {
        logStripeEvent(event.id, event.type);
        await recordActivity({
          admin,
          level: "warn",
          action: "payment.checkout.failed",
          source: "stripe_webhook",
          message: "Checkout Stripe echoue (async).",
          metadata: {
            eventId: event.id,
            eventType: event.type,
          },
        });
        break;
      }
      default: {
        logStripeEvent(event.id, event.type);
        await recordActivity({
          admin,
          action: "payment.webhook.received",
          source: "stripe_webhook",
          message: "Webhook Stripe recu.",
          metadata: {
            eventId: event.id,
            eventType: event.type,
          },
        });
      }
    }
  } catch {
    await recordActivity({
      admin,
      level: "error",
      action: "payment.webhook.failed",
      source: "stripe_webhook",
      message: "Traitement webhook Stripe en erreur.",
      metadata: {
        eventId: event.id,
        eventType: event.type,
      },
    });
    await admin.from("stripe_events").delete().eq("event_id", event.id);
    return NextResponse.json({ error: "Erreur webhook Stripe." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
