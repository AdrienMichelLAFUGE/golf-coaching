import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: plans, error: plansError } = await admin
    .from("pricing_plans")
    .select(
      "id, slug, label, price_cents, currency, interval, badge, cta_label, features, is_active, is_highlighted, sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (plansError) {
    return NextResponse.json({ error: plansError.message }, { status: 500 });
  }

  return NextResponse.json({ plans: plans ?? [] });
}
