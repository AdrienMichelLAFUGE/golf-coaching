import { z } from "zod";

export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const planTierSchema = z.enum(PLAN_TIERS);

export type PlanQuotas = {
  reportsPer30d: number | null;
  tpiImportsPer30d: number | null;
  dataExtractsPer30d: number | null;
};

export type TestsAccess = {
  scope: "pelz" | "catalog";
  canCreate: boolean;
  publicRequiresAdminValidation: boolean;
};

export type PlanEntitlements = {
  tier: PlanTier;
  label: string;
  aiProofreadEnabled: boolean;
  aiEnabled: boolean;
  tpiEnabled: boolean;
  dataExtractEnabled: boolean;
  canCreateOrg: boolean;
  quotas: PlanQuotas;
  tests: TestsAccess;
};

export type WorkspaceEntitlements = PlanEntitlements & {
  isReadOnly: boolean;
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Entreprise",
};

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlements> = {
  free: {
    tier: "free",
    label: "Free",
    aiProofreadEnabled: true,
    aiEnabled: false,
    tpiEnabled: false,
    dataExtractEnabled: false,
    canCreateOrg: false,
    quotas: {
      reportsPer30d: null,
      tpiImportsPer30d: null,
      dataExtractsPer30d: null,
    },
    tests: {
      scope: "pelz",
      canCreate: false,
      publicRequiresAdminValidation: true,
    },
  },
  pro: {
    tier: "pro",
    label: "Pro",
    aiProofreadEnabled: true,
    aiEnabled: true,
    tpiEnabled: true,
    dataExtractEnabled: true,
    canCreateOrg: true,
    quotas: {
      reportsPer30d: 100,
      tpiImportsPer30d: 30,
      dataExtractsPer30d: 100,
    },
    tests: {
      scope: "catalog",
      canCreate: true,
      publicRequiresAdminValidation: true,
    },
  },
  enterprise: {
    tier: "enterprise",
    label: "Entreprise",
    aiProofreadEnabled: true,
    aiEnabled: true,
    tpiEnabled: true,
    dataExtractEnabled: true,
    canCreateOrg: true,
    quotas: {
      reportsPer30d: null,
      tpiImportsPer30d: null,
      dataExtractsPer30d: null,
    },
    tests: {
      scope: "catalog",
      canCreate: true,
      publicRequiresAdminValidation: true,
    },
  },
};

export const resolvePlanTier = (value?: string | null): PlanTier => {
  if (!value) return "free";
  if (value === "standard") return "pro";
  return PLAN_TIERS.includes(value as PlanTier) ? (value as PlanTier) : "free";
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isPlanTierOverrideActive = (params: {
  overrideTier?: string | null;
  overrideStartsAt?: string | null;
  overrideExpiresAt?: string | null;
  overrideUnlimited?: boolean | null;
  now?: Date;
}) => {
  if (!params.overrideTier) {
    return false;
  }

  if (params.overrideUnlimited) {
    return true;
  }

  const now = params.now ?? new Date();
  const startsAt = parseIsoDate(params.overrideStartsAt);
  if (startsAt && startsAt > now) {
    return false;
  }

  const expiresAt = parseIsoDate(params.overrideExpiresAt);
  if (expiresAt && expiresAt <= now) {
    return false;
  }

  return true;
};

export const resolveEffectivePlanTier = (
  planTier: string | null | undefined,
  overrideTier: string | null | undefined,
  overrideExpiresAt: string | null | undefined,
  now: Date = new Date(),
  overrideStartsAt?: string | null,
  overrideUnlimited?: boolean | null
): { tier: PlanTier; isOverrideActive: boolean } => {
  const baseTier = resolvePlanTier(planTier);
  const isOverrideActive = isPlanTierOverrideActive({
    overrideTier,
    overrideStartsAt: overrideStartsAt ?? null,
    overrideExpiresAt,
    overrideUnlimited: overrideUnlimited ?? false,
    now,
  });
  if (!overrideTier || !isOverrideActive) {
    return { tier: baseTier, isOverrideActive: false };
  }
  return { tier: resolvePlanTier(overrideTier), isOverrideActive: true };
};

export const getWorkspaceEntitlements = (
  tier: PlanTier,
  workspaceType: "personal" | "org" | null
): WorkspaceEntitlements => {
  const base = PLAN_ENTITLEMENTS[tier];
  const isReadOnly = workspaceType === "org" && tier === "free";
  return {
    ...base,
    isReadOnly,
  };
};
