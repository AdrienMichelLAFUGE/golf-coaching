import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityLogLevel = "info" | "warn" | "error";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type RecordActivityInput = {
  admin?: SupabaseClient | null;
  action: string;
  level?: ActivityLogLevel;
  source?: string;
  actorUserId?: string | null;
  orgId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  message?: string | null;
  metadata?: JsonValue;
};

export const recordActivity = async (input: RecordActivityInput) => {
  if (!input.admin || typeof input.admin.from !== "function") {
    return;
  }

  try {
    const logsTable = input.admin.from("app_activity_logs") as unknown as {
      insert?: (
        values: Array<{
          level: ActivityLogLevel;
          action: string;
          source: string;
          actor_user_id: string | null;
          org_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          message: string | null;
          metadata: JsonValue;
        }>
      ) =>
        | Promise<{ error?: { message?: string } | null }>
        | { error?: { message?: string } | null };
    };

    if (!logsTable || typeof logsTable.insert !== "function") {
      return;
    }

    const { error } = await logsTable.insert([
      {
        level: input.level ?? "info",
        action: input.action,
        source: input.source ?? "api",
        actor_user_id: input.actorUserId ?? null,
        org_id: input.orgId ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        message: input.message ?? null,
        metadata: input.metadata ?? {},
      },
    ]);

    if (error) {
      console.error("[activity-log] failed to persist", {
        action: input.action,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("[activity-log] unexpected error", {
      action: input.action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
