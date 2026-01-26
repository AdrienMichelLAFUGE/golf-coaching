import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";

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

const normalizePlan = (plan: PricingPlanPayload) => {
  const label = (plan.label ?? "").trim();
  const slug = (plan.slug ?? "").trim().toLowerCase();
  const priceCents = Number.isFinite(plan.price_cents)
    ? Math.max(0, Math.round(Number(plan.price_cents)))
    : 0;
  const currency = (plan.currency ?? "EUR").trim().toUpperCase();
  const interval =
    plan.interval === "year" || plan.interval === "month"
      ? plan.interval
      : "month";
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return {
      error: NextResponse.json(
        { error: "Missing Supabase env vars." },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createClient(supabaseUrl, serviceRoleKey),
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
    return NextResponse.json(
      { error: plansError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ plans: plans ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json()) as {
    plan?: PricingPlanPayload;
  };
  const rawPlan = payload.plan ?? payload;
  if (!rawPlan || typeof rawPlan !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const plan = normalizePlan(rawPlan as PricingPlanPayload);
  const id = (rawPlan as PricingPlanPayload).id ?? null;

  if (!plan.slug) {
    return NextResponse.json({ error: "Slug requis." }, { status: 400 });
  }

  if (id) {
    const { error: updateError } = await auth.admin
      .from("pricing_plans")
      .update(plan)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  const { error: insertError } = await auth.admin
    .from("pricing_plans")
    .insert([plan]);

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json()) as { id?: string };
  const id = payload?.id;

  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const { error: deleteError } = await auth.admin
    .from("pricing_plans")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
