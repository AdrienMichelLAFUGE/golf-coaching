import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

export const runtime = "nodejs";

type CoachUpdatePayload = {
  orgId?: string;
  ai_enabled?: boolean;
  tpi_enabled?: boolean;
  radar_enabled?: boolean;
  ai_model?: string | null;
};

const coachUpdateSchema = z.object({
  orgId: z.string().min(1),
  ai_enabled: z.boolean().optional(),
  tpi_enabled: z.boolean().optional(),
  radar_enabled: z.boolean().optional(),
  ai_model: z.string().nullable().optional(),
});

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createSupabaseAdminClient(),
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data: organizations, error: orgError } = await auth.admin
    .from("organizations")
    .select("id, name, ai_enabled, tpi_enabled, radar_enabled, ai_model");

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  const { data: owners, error: ownerError } = await auth.admin
    .from("profiles")
    .select("id, org_id, full_name, role")
    .eq("role", "owner");

  if (ownerError) {
    return NextResponse.json({ error: ownerError.message }, { status: 500 });
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
    tpi_enabled: org.tpi_enabled ?? false,
    radar_enabled: org.radar_enabled ?? false,
    ai_model: org.ai_model ?? "gpt-5-mini",
    owner: ownerByOrg.get(org.id) ?? null,
  }));

  return NextResponse.json({ organizations: payload });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, coachUpdateSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const payload = parsed.data as CoachUpdatePayload;
  const orgId = payload.orgId?.trim();

  const updates: Record<string, unknown> = {};
  if (typeof payload.ai_enabled === "boolean") {
    updates.ai_enabled = payload.ai_enabled;
  }
  if (typeof payload.tpi_enabled === "boolean") {
    updates.tpi_enabled = payload.tpi_enabled;
  }
  if (typeof payload.radar_enabled === "boolean") {
    updates.radar_enabled = payload.radar_enabled;
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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
