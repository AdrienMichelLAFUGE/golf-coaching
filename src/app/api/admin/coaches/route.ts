import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

type CoachUpdatePayload = {
  orgId?: string;
  ai_enabled?: boolean;
  ai_model?: string | null;
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

  const { data: organizations, error: orgError } = await auth.admin
    .from("organizations")
    .select("id, name, ai_enabled, ai_model");

  if (orgError) {
    return NextResponse.json(
      { error: orgError.message },
      { status: 500 }
    );
  }

  const { data: owners, error: ownerError } = await auth.admin
    .from("profiles")
    .select("id, org_id, full_name, role")
    .eq("role", "owner");

  if (ownerError) {
    return NextResponse.json(
      { error: ownerError.message },
      { status: 500 }
    );
  }

  const ownerByOrg = new Map(
    (owners ?? []).map((owner) => [
      owner.org_id,
      { id: owner.id, full_name: owner.full_name ?? null },
    ])
  );

  const payload = (organizations ?? []).map((org) => ({
    id: org.id,
    name: org.name ?? "",
    ai_enabled: org.ai_enabled ?? false,
    ai_model: org.ai_model ?? "gpt-5-mini",
    owner: ownerByOrg.get(org.id) ?? null,
  }));

  return NextResponse.json({ organizations: payload });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json()) as CoachUpdatePayload;
  const orgId = payload.orgId?.trim();

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof payload.ai_enabled === "boolean") {
    updates.ai_enabled = payload.ai_enabled;
  }
  if (typeof payload.ai_model === "string") {
    updates.ai_model = payload.ai_model.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  const { error: updateError } = await auth.admin
    .from("organizations")
    .update(updates)
    .eq("id", orgId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
