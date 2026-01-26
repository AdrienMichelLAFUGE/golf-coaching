import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase env vars." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: plans, error: plansError } = await admin
    .from("pricing_plans")
    .select(
      "id, slug, label, price_cents, currency, interval, badge, cta_label, features, is_active, is_highlighted, sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (plansError) {
    return NextResponse.json(
      { error: plansError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ plans: plans ?? [] });
}
