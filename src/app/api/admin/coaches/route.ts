import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { assertBackofficeUnlocked } from "@/lib/backoffice-auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { planTierSchema } from "@/lib/plans";
import { recordActivity } from "@/lib/activity-log";
import { getAiBudgetMonthWindow, loadAiBudgetSummary } from "@/lib/ai/budget";

export const runtime = "nodejs";

type CoachUpdatePayload = {
  orgId?: string;
  coachId?: string;
  ai_enabled?: boolean;
  tpi_enabled?: boolean;
  radar_enabled?: boolean;
  coaching_dynamic_enabled?: boolean;
  ai_model?: string | null;
  ai_budget_enabled?: boolean;
  ai_budget_monthly_cents?: number | null;
  ai_credit_topup_cents?: number;
  ai_credit_topup_note?: string | null;
  plan_tier?: string;
  plan_tier_override?: string | null;
  plan_tier_override_expires_at?: string | null;
};

const coachUpdateSchema = z.object({
  orgId: z.string().min(1).optional(),
  coachId: z.string().min(1).optional(),
  ai_enabled: z.boolean().optional(),
  tpi_enabled: z.boolean().optional(),
  radar_enabled: z.boolean().optional(),
  coaching_dynamic_enabled: z.boolean().optional(),
  ai_model: z.string().nullable().optional(),
  ai_budget_enabled: z.boolean().optional(),
  ai_budget_monthly_cents: z.number().int().positive().max(10_000_000).nullable().optional(),
  ai_credit_topup_cents: z.number().int().positive().max(10_000_000).optional(),
  ai_credit_topup_note: z.string().max(240).nullable().optional(),
  plan_tier: planTierSchema.optional(),
  plan_tier_override: planTierSchema.nullable().optional(),
  plan_tier_override_expires_at: z.string().datetime().nullable().optional(),
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

  const backofficeError = assertBackofficeUnlocked(request);
  if (backofficeError) {
    return {
      error: backofficeError,
    };
  }

  return {
    admin: createSupabaseAdminClient(),
    userId,
  };
};

const toNumber = (value: number | string | null | undefined) => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data: organizations, error: orgError } = await auth.admin
    .from("organizations")
    .select(
      "id, name, workspace_type, owner_profile_id, plan_tier, plan_tier_override, plan_tier_override_expires_at, ai_enabled, tpi_enabled, radar_enabled, coaching_dynamic_enabled, ai_model"
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
        plan_tier_override: org.plan_tier_override ?? null,
        plan_tier_override_expires_at: org.plan_tier_override_expires_at ?? null,
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
    {
      id: string;
      full_name: string | null;
      role: string | null;
      ai_budget_enabled: boolean;
      ai_budget_monthly_cents: number | null;
    }
  >();
  const budgetEnabledByProfile = new Map<string, boolean>();
  const budgetAmountByProfile = new Map<string, number | null>();
  const budgetTopupByProfile = new Map<string, number>();
  const budgetSpentByProfile = new Map<string, number>();
  const budgetRemainingByProfile = new Map<string, number | null>();

  if (uniqueCoachIds.length > 0) {
    const { data: profilesData, error: profilesError } = await auth.admin
      .from("profiles")
      .select("id, full_name, role, ai_budget_enabled, ai_budget_monthly_cents")
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
          ai_budget_enabled: profile.ai_budget_enabled ?? false,
          ai_budget_monthly_cents: profile.ai_budget_monthly_cents ?? null,
        },
      ])
    );

    const summaries = await Promise.all(
      uniqueCoachIds.map(async (coachId) => {
        const profile = profilesById.get(coachId);
        const summary = await loadAiBudgetSummary({
          admin: auth.admin,
          userId: coachId,
          profileBudget: profile
            ? {
                ai_budget_enabled: profile.ai_budget_enabled,
                ai_budget_monthly_cents: profile.ai_budget_monthly_cents,
              }
            : null,
        });
        return [coachId, summary] as const;
      })
    );

    summaries.forEach(([coachId, summary]) => {
      budgetEnabledByProfile.set(coachId, summary.enabled);
      budgetAmountByProfile.set(coachId, summary.monthlyBudgetCents ?? null);
      budgetTopupByProfile.set(coachId, summary.monthTopupCents);
      budgetSpentByProfile.set(coachId, summary.monthSpentCents);
      budgetRemainingByProfile.set(coachId, summary.monthRemainingCents);
    });
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
            ai_budget_enabled:
              budgetEnabledByProfile.get(membership.user_id) ??
              profile?.ai_budget_enabled ??
              false,
            ai_budget_monthly_cents:
              budgetAmountByProfile.get(membership.user_id) ??
              profile?.ai_budget_monthly_cents ??
              null,
            ai_budget_spent_cents_current_month:
              budgetSpentByProfile.get(membership.user_id) ?? 0,
            ai_budget_topup_cents_current_month:
              budgetTopupByProfile.get(membership.user_id) ?? 0,
            ai_budget_remaining_cents_current_month:
              budgetRemainingByProfile.get(membership.user_id) ?? null,
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
  const orgId = payload.orgId?.trim() ?? null;
  const coachId = payload.coachId?.trim() ?? null;

  const orgUpdates: Record<string, unknown> = {};
  if (typeof payload.plan_tier === "string") {
    await recordActivity({
      admin: auth.admin,
      level: "warn",
      action: "admin.coach.update.denied",
      actorUserId: auth.userId ?? null,
      orgId: orgId ?? null,
      message: "Modification coach refusee: plan_tier direct interdit.",
    });
    return NextResponse.json(
      { error: "Plan gere via Stripe. Modification interdite." },
      { status: 403 }
    );
  }
  if (typeof payload.ai_enabled === "boolean") {
    orgUpdates.ai_enabled = payload.ai_enabled;
  }
  if (typeof payload.tpi_enabled === "boolean") {
    orgUpdates.tpi_enabled = payload.tpi_enabled;
  }
  if (typeof payload.radar_enabled === "boolean") {
    orgUpdates.radar_enabled = payload.radar_enabled;
  }
  if (typeof payload.coaching_dynamic_enabled === "boolean") {
    orgUpdates.coaching_dynamic_enabled = payload.coaching_dynamic_enabled;
  }
  if (typeof payload.ai_model === "string") {
    orgUpdates.ai_model = payload.ai_model.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "plan_tier_override")) {
    orgUpdates.plan_tier_override =
      typeof payload.plan_tier_override === "string"
        ? payload.plan_tier_override
        : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "plan_tier_override_expires_at")) {
    orgUpdates.plan_tier_override_expires_at =
      payload.plan_tier_override_expires_at ?? null;
  }

  const hasBudgetAmountUpdate = Object.prototype.hasOwnProperty.call(
    payload,
    "ai_budget_monthly_cents"
  );
  const wantsCoachBudgetUpdate =
    typeof payload.ai_budget_enabled === "boolean" || hasBudgetAmountUpdate;
  const hasTopup = typeof payload.ai_credit_topup_cents === "number";
  const hasOrgUpdates = Object.keys(orgUpdates).length > 0;

  if (!hasOrgUpdates && !wantsCoachBudgetUpdate && !hasTopup) {
    await recordActivity({
      admin: auth.admin,
      level: "warn",
      action: "admin.coach.update.denied",
      actorUserId: auth.userId ?? null,
      orgId: orgId ?? null,
      message: "Modification coach refusee: aucune mise a jour.",
    });
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  if (hasOrgUpdates && !orgId) {
    return NextResponse.json({ error: "orgId requis." }, { status: 422 });
  }

  let orgData: { id: string; workspace_type: string; owner_profile_id: string | null } | null =
    null;

  if (hasOrgUpdates && orgId) {
    const { data: fetchedOrgData, error: orgDataError } = await auth.admin
      .from("organizations")
      .select("id, workspace_type, owner_profile_id")
      .eq("id", orgId)
      .single();

    if (orgDataError || !fetchedOrgData) {
      await recordActivity({
        admin: auth.admin,
        level: "warn",
        action: "admin.coach.update.denied",
        actorUserId: auth.userId ?? null,
        orgId: orgId ?? null,
        message: "Modification coach refusee: organisation introuvable.",
      });
      return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 });
    }
    orgData = fetchedOrgData;

    const { error: updateError } = await auth.admin
      .from("organizations")
      .update(orgUpdates)
      .eq("id", orgId);

    if (updateError) {
      await recordActivity({
        admin: auth.admin,
        level: "error",
        action: "admin.coach.update.failed",
        actorUserId: auth.userId ?? null,
        orgId,
        message: updateError.message ?? "Modification coach impossible.",
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (orgData.workspace_type === "personal" && orgData.owner_profile_id) {
      if (typeof payload.ai_enabled === "boolean") {
        const { error: premiumError } = await auth.admin
          .from("profiles")
          .update({ premium_active: payload.ai_enabled })
          .eq("id", orgData.owner_profile_id);

        if (premiumError) {
          await recordActivity({
            admin: auth.admin,
            level: "error",
            action: "admin.coach.update.failed",
            actorUserId: auth.userId ?? null,
            orgId,
            message: premiumError.message ?? "Synchronisation premium profil impossible.",
          });
      return NextResponse.json({ error: premiumError.message }, { status: 500 });
        }
      }
    }
  }

  if (wantsCoachBudgetUpdate || hasTopup) {
    if (!coachId) {
      return NextResponse.json({ error: "coachId requis." }, { status: 422 });
    }

    const { data: coachProfile, error: coachProfileError } = await auth.admin
      .from("profiles")
      .select("id, ai_budget_enabled, ai_budget_monthly_cents")
      .eq("id", coachId)
      .maybeSingle();

    if (coachProfileError) {
      await recordActivity({
        admin: auth.admin,
        level: "error",
        action: "admin.coach.update.failed",
        actorUserId: auth.userId ?? null,
        orgId,
        message: coachProfileError.message ?? "Lecture quota IA coach impossible.",
      });
      return NextResponse.json({ error: coachProfileError.message }, { status: 500 });
    }

    if (!coachProfile) {
      await recordActivity({
        admin: auth.admin,
        level: "warn",
        action: "admin.coach.update.denied",
        actorUserId: auth.userId ?? null,
        orgId,
        message: "Modification coach refusee: profil coach introuvable.",
      });
      return NextResponse.json({ error: "Coach introuvable." }, { status: 404 });
    }

    const budgetUpdates: Record<string, unknown> = {};
    if (typeof payload.ai_budget_enabled === "boolean") {
      budgetUpdates.ai_budget_enabled = payload.ai_budget_enabled;
    }
    if (hasBudgetAmountUpdate) {
      budgetUpdates.ai_budget_monthly_cents = payload.ai_budget_monthly_cents ?? null;
    }

    const nextBudgetEnabled =
      typeof payload.ai_budget_enabled === "boolean"
        ? payload.ai_budget_enabled
        : (coachProfile.ai_budget_enabled ?? false);
    const nextBudgetCents = hasBudgetAmountUpdate
      ? payload.ai_budget_monthly_cents ?? null
      : (coachProfile.ai_budget_monthly_cents ?? null);

    if (nextBudgetEnabled && (!nextBudgetCents || nextBudgetCents < 1)) {
      return NextResponse.json(
        {
          error:
            "Le budget IA est actif: renseigne un montant mensuel strictement positif.",
        },
        { status: 422 }
      );
    }

    if (Object.keys(budgetUpdates).length > 0) {
      const { error: budgetUpdateError } = await auth.admin
        .from("profiles")
        .update(budgetUpdates)
        .eq("id", coachId);

      if (budgetUpdateError) {
        await recordActivity({
          admin: auth.admin,
          level: "error",
          action: "admin.coach.update.failed",
          actorUserId: auth.userId ?? null,
          orgId,
          message: budgetUpdateError.message ?? "Mise a jour budget IA coach impossible.",
        });
        return NextResponse.json({ error: budgetUpdateError.message }, { status: 500 });
      }
    }

    if (hasTopup) {
      const topupCents = toNumber(payload.ai_credit_topup_cents);
      if (topupCents < 1) {
        return NextResponse.json(
          { error: "Montant de recharge invalide." },
          { status: 422 }
        );
      }
      const { monthKey } = getAiBudgetMonthWindow();
      const { error: topupError } = await auth.admin.from("ai_credit_topups").insert([
        {
          profile_id: coachId,
          amount_cents: topupCents,
          month_key: monthKey,
          note: payload.ai_credit_topup_note?.trim() || null,
          created_by: auth.userId ?? null,
        },
      ]);
      if (topupError) {
        await recordActivity({
          admin: auth.admin,
          level: "error",
          action: "admin.coach.update.failed",
          actorUserId: auth.userId ?? null,
          orgId,
          message: topupError.message ?? "Recharge credits IA impossible.",
        });
        return NextResponse.json({ error: topupError.message }, { status: 500 });
      }
    }
  }

  await recordActivity({
    admin: auth.admin,
    action: "admin.coach.update.success",
    actorUserId: auth.userId ?? null,
    orgId: orgId ?? null,
    entityType: orgId ? "organization" : "profile",
    entityId: orgId ?? coachId ?? null,
    message: "Parametres coach/orga modifies par admin.",
  });

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
    await recordActivity({
      admin: auth.admin,
      level: "warn",
      action: "admin.coach.delete.denied",
      actorUserId: auth.userId,
      entityType: "profile",
      entityId: coachId,
      message: "Suppression coach refusee: auto suppression.",
    });
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
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "admin.coach.delete.failed",
      actorUserId: auth.userId ?? null,
      entityType: "profile",
      entityId: coachId,
      message: tpiCleanupError.message ?? "Nettoyage TPI impossible.",
    });
    return NextResponse.json({ error: tpiCleanupError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const anonymizedAuthEmail = `deleted+${coachId}@example.invalid`;
  const replacementPassword = `${randomUUID()}${randomUUID()}`;

  const { error: authUpdateError } = await auth.admin.auth.admin.updateUserById(
    coachId,
    {
      email: anonymizedAuthEmail,
      password: replacementPassword,
      user_metadata: {
        deleted_at: now,
        deleted_by_admin: true,
      },
    }
  );

  if (authUpdateError) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "admin.coach.delete.failed",
      actorUserId: auth.userId ?? null,
      entityType: "profile",
      entityId: coachId,
      message: authUpdateError.message ?? "Anonymisation auth impossible.",
    });
    return NextResponse.json({ error: authUpdateError.message }, { status: 400 });
  }

  const { error: profileError } = await auth.admin
    .from("profiles")
    .update({
      full_name: "Compte supprime",
      avatar_url: null,
      deleted_at: now,
    })
    .eq("id", coachId);

  if (profileError) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "admin.coach.delete.failed",
      actorUserId: auth.userId ?? null,
      entityType: "profile",
      entityId: coachId,
      message: profileError.message ?? "Anonymisation profil impossible.",
    });
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: membershipError } = await auth.admin
    .from("org_memberships")
    .update({ status: "disabled" })
    .eq("user_id", coachId)
    .eq("status", "active");

  if (membershipError) {
    await recordActivity({
      admin: auth.admin,
      level: "error",
      action: "admin.coach.delete.failed",
      actorUserId: auth.userId ?? null,
      entityType: "profile",
      entityId: coachId,
      message: membershipError.message ?? "Desactivation memberships impossible.",
    });
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  await recordActivity({
    admin: auth.admin,
    action: "admin.coach.delete.success",
    actorUserId: auth.userId ?? null,
    entityType: "profile",
    entityId: coachId,
    message: "Coach supprime par admin.",
  });

  return NextResponse.json({ ok: true });
}
