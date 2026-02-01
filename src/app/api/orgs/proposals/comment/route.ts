import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { createOrgNotifications } from "@/lib/org-notifications";

const commentSchema = z.object({
  proposalId: z.string().uuid(),
  comment: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, commentSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

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

  const { data: proposal } = await admin
    .from("org_proposals")
    .select("id, org_id, student_id, created_by")
    .eq("id", parsed.data.proposalId)
    .single();

  if (!proposal || proposal.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Proposition introuvable." }, { status: 404 });
  }

  const { error: insertError } = await admin.from("org_proposal_comments").insert([
    {
      proposal_id: proposal.id,
      author_id: profile.id,
      comment: parsed.data.comment.trim(),
    },
  ]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await createOrgNotifications(admin, {
    orgId: proposal.org_id,
    userIds: [proposal.created_by],
    type: "proposal.comment",
    payload: { proposalId: proposal.id, studentId: proposal.student_id },
  });

  return NextResponse.json({ ok: true });
}
