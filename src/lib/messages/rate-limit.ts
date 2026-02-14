import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type MessageRateLimitAction =
  | "thread_create"
  | "message_send"
  | "coach_contact_request"
  | "coach_contact_respond";

type RateLimitPolicy = {
  maxRequests: number;
  windowSeconds: number;
};

type ConsumeRateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
  current_count: number;
};

const MESSAGE_RATE_LIMIT_POLICIES: Record<MessageRateLimitAction, RateLimitPolicy> = {
  thread_create: { maxRequests: 10, windowSeconds: 60 },
  message_send: { maxRequests: 30, windowSeconds: 60 },
  coach_contact_request: { maxRequests: 6, windowSeconds: 300 },
  coach_contact_respond: { maxRequests: 20, windowSeconds: 60 },
};

export type MessageRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export const enforceMessageRateLimit = async (
  admin: AdminClient,
  userId: string,
  action: MessageRateLimitAction
): Promise<MessageRateLimitResult> => {
  const policy = MESSAGE_RATE_LIMIT_POLICIES[action];
  const limitKey = `messages:${action}:${userId}`;

  const { data, error } = await admin.rpc("consume_rate_limit", {
    limit_key: limitKey,
    window_seconds: policy.windowSeconds,
    max_requests: policy.maxRequests,
  });

  if (error) {
    // Fail open until migration is applied everywhere to avoid blocking messaging.
    console.error("[messages] rate limit rpc failed", {
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

