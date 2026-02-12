import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

const requestedStudentSchema = z.object({
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  playing_hand: z.union([z.literal("right"), z.literal("left")]).optional().nullable(),
});

const linkRequestPayloadSchema = z.object({
  kind: z.literal("student_link_request"),
  requester_org_id: z.string().optional().nullable(),
  requested_student: requestedStudentSchema.optional().nullable(),
});

type PendingLinkRow = {
  id: string;
  created_at: string;
  payload: unknown;
};

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: rows, error: rowsError } = await admin
    .from("org_proposals")
    .select("id, created_at, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 400 });
  }

  const requests = ((rows ?? []) as PendingLinkRow[])
    .map((row) => {
      const parsedPayload = linkRequestPayloadSchema.safeParse(row.payload ?? null);
      if (!parsedPayload.success) return null;
      if (parsedPayload.data.requester_org_id !== profile.org_id) return null;

      const requested = parsedPayload.data.requested_student ?? null;
      return {
        proposal_id: row.id,
        created_at: row.created_at,
        first_name: requested?.first_name?.trim() || "Eleve",
        last_name: requested?.last_name?.trim() || null,
        email: requested?.email?.trim() || null,
        playing_hand: requested?.playing_hand ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return NextResponse.json({ requests });
}
