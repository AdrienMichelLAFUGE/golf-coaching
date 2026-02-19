import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ParentRateLimitAction = "link_child";

type RateLimitPolicy = {
  maxRequests: number;
  windowSeconds: number;
};

type ConsumeRateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number;
};

const PARENT_RATE_LIMIT_POLICIES: Record<ParentRateLimitAction, RateLimitPolicy> = {
  link_child: {
    maxRequests: 6,
    windowSeconds: 300,
  },
};

export type ParentRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export const enforceParentRateLimit = async (
  admin: AdminClient,
  userId: string,
  action: ParentRateLimitAction
): Promise<ParentRateLimitResult> => {
  const policy = PARENT_RATE_LIMIT_POLICIES[action];
  const limitKey = `parent:${action}:${userId}`;

  const { data, error } = await admin.rpc("consume_rate_limit", {
    limit_key: limitKey,
    window_seconds: policy.windowSeconds,
    max_requests: policy.maxRequests,
  });

  if (error) {
    console.error("[parent] rate limit rpc failed", {
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

