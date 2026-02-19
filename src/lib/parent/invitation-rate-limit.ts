import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ParentInvitationRateLimitAction = "create_invitation" | "accept_invitation";

type RateLimitPolicy = {
  maxRequests: number;
  windowSeconds: number;
};

type ConsumeRateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number;
};

const POLICIES: Record<ParentInvitationRateLimitAction, RateLimitPolicy> = {
  create_invitation: {
    maxRequests: 12,
    windowSeconds: 900,
  },
  accept_invitation: {
    maxRequests: 20,
    windowSeconds: 900,
  },
};

export type ParentInvitationRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export const enforceParentInvitationRateLimit = async (
  admin: AdminClient,
  userId: string,
  action: ParentInvitationRateLimitAction
): Promise<ParentInvitationRateLimitResult> => {
  const policy = POLICIES[action];
  const limitKey = `parent_invitation:${action}:${userId}`;

  const { data, error } = await admin.rpc("consume_rate_limit", {
    limit_key: limitKey,
    window_seconds: policy.windowSeconds,
    max_requests: policy.maxRequests,
  });

  if (error) {
    console.error("[parent-invitation] rate limit rpc failed", {
      action,
      userId,
      code: error.code,
      message: error.message,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? (data[0] as ConsumeRateLimitRow | undefined) : undefined;
  if (!row || typeof row.allowed !== "boolean") {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
  };
};
