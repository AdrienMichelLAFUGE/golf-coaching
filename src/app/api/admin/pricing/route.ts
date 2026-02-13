import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

type PricingPlanPayload = {
  id?: string | null;
  slug?: string | null;
  label?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  interval?: "month" | "year" | null;
  badge?: string | null;
  cta_label?: string | null;
  features?: string[] | null;
  is_active?: boolean | null;
  is_highlighted?: boolean | null;
  sort_order?: number | null;
};

const pricingPlanSchema = z.object({
  id: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  price_cents: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  interval: z.enum(["month", "year"]).nullable().optional(),
  badge: z.string().nullable().optional(),
  cta_label: z.string().nullable().optional(),
  features: z.array(z.string()).nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  is_highlighted: z.boolean().nullable().optional(),
  sort_order: z.number().nullable().optional(),
});

const pricingPayloadSchema = z.union([
  pricingPlanSchema,
  z.object({ plan: pricingPlanSchema }),
]);

const pricingDeleteSchema = z.object({
  id: z.string().min(1),
});

const normalizePlan = (plan: PricingPlanPayload) => {
  const label = (plan.label ?? "").trim();
  const slug = (plan.slug ?? "").trim().toLowerCase();
  const priceCents = Number.isFinite(plan.price_cents)
    ? Math.max(0, Math.round(Number(plan.price_cents)))
    : 0;
  const currency = (plan.currency ?? "EUR").trim().toUpperCase();
  const interval =
    plan.interval === "year" || plan.interval === "month" ? plan.interval : "month";
  const badge = plan.badge?.trim() || null;
  const ctaLabel = plan.cta_label?.trim() || null;
  const features = Array.isArray(plan.features)
    ? plan.features.map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    label: label || "Plan",
    slug: slug || "plan",
    price_cents: priceCents,
    currency,
    interval,
    badge,
    cta_label: ctaLabel,
    features,
    is_active: plan.is_active ?? true,
    is_highlighted: plan.is_highlighted ?? false,
    sort_order:
      typeof plan.sort_order === "number" && Number.isFinite(plan.sort_order)
        ? Math.trunc(plan.sort_order)
        : 0,
  };
};

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  const userId = userData.user?.id ?? null;
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createSupabaseAdminClient(),
    userId,
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data: plans, error: plansError } = await auth.admin
    .from("pricing_plans")
    .select(
      "id, slug, label, price_cents, currency, interval, badge, cta_label, features, is_active, is_highlighted, sort_order"
    )
    .order("sort_order", { ascending: true });

  if (plansError) {
    return NextResponse.json({ error: plansError.message }, { status: 500 });
  }

  return NextResponse.json({ plans: plans ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, pricingPayloadSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }
  const rawPlan = "plan" in parsed.data ? parsed.data.plan : parsed.data;

  const plan = normalizePlan(rawPlan as PricingPlanPayload);
  const id = (rawPlan as PricingPlanPayload).id ?? null;

  if (!plan.slug) {
    await recordActivity({
      admin: auth.admin,
      level: "warn",
      action: "admin.pricing.update.denied",
      actorUserId: auth.userId,
      message: "Modification pricing refusee: slug manquant.",
    });
    return NextResponse.json({ error: "Slug requis." }, { status: 400 });
  }

  if (id) {
    const { error: updateError } = await auth.admin
      .from("pricing_plans")
      .update(plan)
      .eq("id", id);

    if (updateError) {
      await recordActivity({
        admin: auth.admin,
        level: "error",
        action: "admin.pricing.update.failed",
        actorUserId: auth.userId,
        entityType: "pricing_plan",
        entityId: id,
        message: updateError.message ?? "Mise a jour plan impossible.",
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await recordActivity({
      admin: auth.admin,
      action: "admin.pricing.update.success",
      actorUserId: auth.userId,
      entityType: "pricing_plan",
      entityId: id,
      message: "Plan tarifaire mis a jour.",
      metadata: {
        slug: plan.slug,
      },
    });

    return NextResponse.json({ ok: true });
  }

  const { error: insertError } = await auth.admin.from("pricing_plans").insert([plan]);

  if (insertError) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "admin.pricing.create.failed",
      actorUserId: auth.userId,
      message: insertError.message ?? "Creation plan impossible.",
      metadata: {
        slug: plan.slug,
      },
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await recordActivity({
    admin: auth.admin,
    action: "admin.pricing.create.success",
    actorUserId: auth.userId,
    message: "Plan tarifaire cree.",
    metadata: {
      slug: plan.slug,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, pricingDeleteSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }
  const { id } = parsed.data;

  const { error: deleteError } = await auth.admin
    .from("pricing_plans")
    .delete()
    .eq("id", id);

  if (deleteError) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "admin.pricing.delete.failed",
      actorUserId: auth.userId,
      entityType: "pricing_plan",
      entityId: id,
      message: deleteError.message ?? "Suppression plan impossible.",
    });
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await recordActivity({
    admin: auth.admin,
    action: "admin.pricing.delete.success",
    actorUserId: auth.userId,
    entityType: "pricing_plan",
    entityId: id,
    message: "Plan tarifaire supprime.",
  });

  return NextResponse.json({ ok: true });
}
