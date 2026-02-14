import "server-only";

import {
  MessagingPolicySchema,
  type MessagingGuardMode,
  type MessagingPolicy,
  type UpdateMessagingPolicyInput,
} from "@/lib/messages/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type OrganizationMessagingPolicyRow = {
  id: string;
  messaging_guard_mode: MessagingGuardMode;
  messaging_sensitive_words: string[] | null;
  messaging_retention_days: number;
  messaging_charter_version: number;
  messaging_supervision_enabled: boolean;
};

const DEFAULT_MESSAGING_POLICY: Omit<MessagingPolicy, "orgId"> = {
  guardMode: "flag",
  sensitiveWords: [],
  retentionDays: 365,
  charterVersion: 1,
  supervisionEnabled: true,
};

export const normalizeSensitiveWords = (words: string[]): string[] =>
  Array.from(
    new Set(
      words
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word.length > 0)
    )
  ).slice(0, 200);

export const loadMessagingPolicy = async (
  admin: AdminClient,
  orgId: string
): Promise<MessagingPolicy> => {
  const { data } = await admin
    .from("organizations")
    .select(
      "id, messaging_guard_mode, messaging_sensitive_words, messaging_retention_days, messaging_charter_version, messaging_supervision_enabled"
    )
    .eq("id", orgId)
    .maybeSingle();

  const row = (data as OrganizationMessagingPolicyRow | null) ?? null;
  if (!row) {
    return {
      orgId,
      ...DEFAULT_MESSAGING_POLICY,
    };
  }

  const parsed = MessagingPolicySchema.safeParse({
    orgId: row.id,
    guardMode: row.messaging_guard_mode,
    sensitiveWords: normalizeSensitiveWords(row.messaging_sensitive_words ?? []),
    retentionDays: row.messaging_retention_days,
    charterVersion: row.messaging_charter_version,
    supervisionEnabled: row.messaging_supervision_enabled,
  });

  if (parsed.success) {
    return parsed.data;
  }

  return {
    orgId: row.id,
    ...DEFAULT_MESSAGING_POLICY,
  };
};

export const updateMessagingPolicy = async (
  admin: AdminClient,
  orgId: string,
  input: UpdateMessagingPolicyInput
) => {
  const updatePayload: Record<string, unknown> = {};

  if (input.guardMode) {
    updatePayload.messaging_guard_mode = input.guardMode;
  }
  if (input.sensitiveWords) {
    updatePayload.messaging_sensitive_words = normalizeSensitiveWords(input.sensitiveWords);
  }
  if (typeof input.retentionDays === "number") {
    updatePayload.messaging_retention_days = input.retentionDays;
  }
  if (typeof input.charterVersion === "number") {
    updatePayload.messaging_charter_version = input.charterVersion;
  }
  if (typeof input.supervisionEnabled === "boolean") {
    updatePayload.messaging_supervision_enabled = input.supervisionEnabled;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { error: null };
  }

  const { error } = await admin.from("organizations").update(updatePayload).eq("id", orgId);
  return { error };
};
