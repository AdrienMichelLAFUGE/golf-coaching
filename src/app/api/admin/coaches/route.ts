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
  coaching_dynamic_enabled?: boolean;
  ai_model?: string | null;
};

const coachUpdateSchema = z.object({
  orgId: z.string().min(1),
  ai_enabled: z.boolean().optional(),
  tpi_enabled: z.boolean().optional(),
  radar_enabled: z.boolean().optional(),
  coaching_dynamic_enabled: z.boolean().optional(),
  ai_model: z.string().nullable().optional(),
});

const coachDeleteSchema = z.object({
  coachId: z.string().min(1),
});

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

  const { data: organizations, error: orgError } = await auth.admin
    .from("organizations")
    .select(
      "id, name, ai_enabled, tpi_enabled, radar_enabled, coaching_dynamic_enabled, ai_model"
    );

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

  const ownerEntries = await Promise.all(
    (owners ?? [])
      .filter((owner) => owner.org_id)
      .map(async (owner) => {
        let email: string | null = null;
        const { data: authData, error: authError } =
          await auth.admin.auth.admin.getUserById(owner.id);
        if (!authError) {
          email = authData.user?.email ?? null;
        }
        return [
          owner.org_id,
          {
            id: owner.id,
            full_name: owner.full_name ?? null,
            email,
          },
        ] as const;
      })
  );

  const ownerByOrg = new Map(ownerEntries);

  const payload = (organizations ?? []).map((org) => ({
    id: org.id,
    name: org.name ?? "",
    ai_enabled: org.ai_enabled ?? false,
    tpi_enabled: org.tpi_enabled ?? false,
    radar_enabled: org.radar_enabled ?? false,
    coaching_dynamic_enabled: org.coaching_dynamic_enabled ?? false,
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
  if (typeof payload.coaching_dynamic_enabled === "boolean") {
    updates.coaching_dynamic_enabled = payload.coaching_dynamic_enabled;
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

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, coachDeleteSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const coachId = parsed.data.coachId.trim();
  if (auth.userId && coachId === auth.userId) {
    return NextResponse.json(
      { error: "Impossible de supprimer votre compte." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await auth.admin.auth.admin.deleteUser(coachId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const { error: profileError } = await auth.admin
    .from("profiles")
    .delete()
    .eq("id", coachId);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
