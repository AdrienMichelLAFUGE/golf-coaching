import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { PLAN_ENTITLEMENTS, planTierSchema, resolvePlanTier } from "@/lib/plans";

export const runtime = "nodejs";

type CoachUpdatePayload = {
  orgId?: string;
  ai_enabled?: boolean;
  tpi_enabled?: boolean;
  radar_enabled?: boolean;
  coaching_dynamic_enabled?: boolean;
  ai_model?: string | null;
  plan_tier?: string;
};

const coachUpdateSchema = z.object({
  orgId: z.string().min(1),
  ai_enabled: z.boolean().optional(),
  tpi_enabled: z.boolean().optional(),
  radar_enabled: z.boolean().optional(),
  coaching_dynamic_enabled: z.boolean().optional(),
  ai_model: z.string().nullable().optional(),
  plan_tier: planTierSchema.optional(),
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
      "id, name, workspace_type, owner_profile_id, plan_tier, ai_enabled, tpi_enabled, radar_enabled, coaching_dynamic_enabled, ai_model"
    );

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  const { data: memberships, error: membershipError } = await auth.admin
    .from("org_memberships")
    .select("id, org_id, role, status, user_id");

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  const orgById = new Map(
    (organizations ?? []).map((org) => [
      org.id,
      {
        id: org.id,
        name: org.name ?? "",
        workspace_type: org.workspace_type ?? "org",
        owner_profile_id: org.owner_profile_id ?? null,
        plan_tier: org.plan_tier ?? "free",
        ai_enabled: org.ai_enabled ?? false,
        tpi_enabled: org.tpi_enabled ?? false,
        radar_enabled: org.radar_enabled ?? false,
        coaching_dynamic_enabled: org.coaching_dynamic_enabled ?? false,
        ai_model: org.ai_model ?? "gpt-5-mini",
      },
    ])
  );

  const uniqueCoachIds = Array.from(
    new Set((memberships ?? []).map((membership) => membership.user_id).filter(Boolean))
  );

  let profilesById = new Map<
    string,
    { id: string; full_name: string | null; role: string | null }
  >();
  if (uniqueCoachIds.length > 0) {
    const { data: profilesData, error: profilesError } = await auth.admin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", uniqueCoachIds);
    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }
    profilesById = new Map(
      (profilesData ?? []).map((profile) => [
        profile.id,
        {
          id: profile.id,
          full_name: profile.full_name ?? null,
          role: profile.role ?? null,
        },
      ])
    );
  }

  const coachEntries = await Promise.all(
    uniqueCoachIds.map(async (coachId) => {
      const { data: authData, error: authError } =
        await auth.admin.auth.admin.getUserById(coachId);
      if (authError) {
        return [
          coachId,
          {
            id: coachId,
            full_name: null,
            email: null,
          },
        ] as const;
      }
      return [
        coachId,
        {
          id: coachId,
          full_name: null,
          email: authData.user?.email ?? null,
        },
      ] as const;
    })
  );

  const coachById = new Map(coachEntries);

  const rows =
    memberships?.flatMap((membership) => {
      const workspace = orgById.get(membership.org_id);
      if (!workspace) return [];
      const coach = coachById.get(membership.user_id) ?? {
        id: membership.user_id,
        full_name: null,
        email: null,
      };
      const profile = profilesById.get(membership.user_id) ?? null;
      if (profile?.role === "student") return [];

      return [
        {
          ...workspace,
          membership_id: membership.id,
          membership_role: membership.role,
          membership_status: membership.status,
          coach: {
            ...coach,
            full_name: profile?.full_name ?? coach.full_name ?? null,
          },
        },
      ];
    }) ?? [];

  const orgsWithMembers = new Set(rows.map((row) => row.id));
  const orphanedRows = Array.from(orgById.values())
    .filter((org) => !orgsWithMembers.has(org.id))
    .filter((org) => {
      if (org.workspace_type !== "personal") return true;
      if (!org.owner_profile_id) return false;
      const owner = profilesById.get(org.owner_profile_id);
      return owner?.role && owner.role !== "student";
    })
    .map((org) => ({
      ...org,
      membership_id: null,
      membership_role: null,
      membership_status: null,
      coach: null,
    }));

  return NextResponse.json({ workspaces: [...rows, ...orphanedRows] });
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
  if (typeof payload.plan_tier === "string") {
    const resolved = resolvePlanTier(payload.plan_tier);
    const entitlements = PLAN_ENTITLEMENTS[resolved];
    updates.plan_tier = resolved;
    updates.ai_enabled = entitlements.aiEnabled;
    updates.tpi_enabled = entitlements.tpiEnabled;
    updates.radar_enabled = entitlements.dataExtractEnabled;
    updates.coaching_dynamic_enabled = entitlements.tests.scope === "catalog";
  }
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

  const { data: orgData, error: orgDataError } = await auth.admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", orgId)
    .single();

  if (orgDataError || !orgData) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 });
  }

  const { error: updateError } = await auth.admin
    .from("organizations")
    .update(updates)
    .eq("id", orgId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (orgData.workspace_type === "personal" && orgData.owner_profile_id) {
    if (typeof payload.plan_tier === "string") {
      const resolved = resolvePlanTier(payload.plan_tier);
      const premiumActive = resolved !== "free";
      const { error: premiumError } = await auth.admin
        .from("profiles")
        .update({ premium_active: premiumActive })
        .eq("id", orgData.owner_profile_id);

      if (premiumError) {
        return NextResponse.json({ error: premiumError.message }, { status: 500 });
      }
    } else if (typeof payload.ai_enabled === "boolean") {
      const { error: premiumError } = await auth.admin
        .from("profiles")
        .update({ premium_active: payload.ai_enabled })
        .eq("id", orgData.owner_profile_id);

      if (premiumError) {
        return NextResponse.json({ error: premiumError.message }, { status: 500 });
      }
    }
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

  const { error: tpiCleanupError } = await auth.admin
    .from("tpi_reports")
    .update({ uploaded_by: null })
    .eq("uploaded_by", coachId);

  if (tpiCleanupError) {
    return NextResponse.json(
      { error: tpiCleanupError.message },
      { status: 500 }
    );
  }

  const { error: deleteError } = await auth.admin.auth.admin.deleteUser(coachId);
  if (deleteError) {
    const { error: profileError } = await auth.admin
      .from("profiles")
      .delete()
      .eq("id", coachId);

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { error: retryError } =
      await auth.admin.auth.admin.deleteUser(coachId);
    if (retryError) {
      return NextResponse.json({ error: retryError.message }, { status: 400 });
    }
  } else {
    const { error: profileError } = await auth.admin
      .from("profiles")
      .delete()
      .eq("id", coachId);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
