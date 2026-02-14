import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { loadMessagingPolicy } from "@/lib/messages/policy";
import { MESSAGE_CHARTER_TEMPLATE } from "@/lib/messages/compliance-copy";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type CharterAcceptanceRow = {
  accepted_at: string;
};

export const MESSAGING_CHARTER_CONTENT = MESSAGE_CHARTER_TEMPLATE;

export const loadMessagingCharterStatus = async (
  admin: AdminClient,
  userId: string,
  orgId: string
) => {
  const policy = await loadMessagingPolicy(admin, orgId);

  const { data } = await admin
    .from("message_user_charter_acceptances")
    .select("accepted_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("charter_version", policy.charterVersion)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const acceptance = (data as CharterAcceptanceRow | null) ?? null;

  return {
    charterVersion: policy.charterVersion,
    mustAccept: !acceptance,
    acceptedAt: acceptance?.accepted_at ?? null,
    content: MESSAGING_CHARTER_CONTENT,
  };
};

export const acceptMessagingCharter = async (
  admin: AdminClient,
  userId: string,
  orgId: string,
  charterVersion: number
) => {
  const acceptedAt = new Date().toISOString();
  const { error } = await admin
    .from("message_user_charter_acceptances")
    .upsert(
      [
        {
          org_id: orgId,
          user_id: userId,
          charter_version: charterVersion,
          accepted_at: acceptedAt,
        },
      ],
      { onConflict: "org_id,user_id,charter_version" }
    );

  return { error, acceptedAt };
};
