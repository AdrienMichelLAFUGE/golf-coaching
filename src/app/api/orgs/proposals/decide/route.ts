import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { createOrgNotifications } from "@/lib/org-notifications";

const decideSchema = z.object({
  proposalId: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, decideSchema);
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

  const { data: workspace, error: workspaceError } = await admin
    .from("organizations")
    .select("ai_enabled")
    .eq("id", profile.org_id)
    .single();

  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (!workspace.ai_enabled) {
    return NextResponse.json(
      { error: "Premium requis pour statuer." },
      { status: 403 }
    );
  }

  const { data: proposal } = await admin
    .from("org_proposals")
    .select("id, org_id, student_id, created_by, status, payload")
    .eq("id", parsed.data.proposalId)
    .single();

  if (!proposal || proposal.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Proposition introuvable." }, { status: 404 });
  }

  if (proposal.status !== "pending") {
    return NextResponse.json({ error: "Proposition deja traitee." }, { status: 400 });
  }

  const { data: assignments } = await admin
    .from("student_assignments")
    .select("coach_id")
    .eq("student_id", proposal.student_id);

  const assignedIds = (assignments ?? []).map(
    (row) => (row as { coach_id: string }).coach_id
  );
  const isAssigned = assignedIds.includes(profile.id);
  const isAdmin = membership.role === "admin";
  if (!isAssigned && !isAdmin) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (parsed.data.decision === "accept") {
    const payload = (proposal.payload ?? {}) as {
      title?: string;
      summary?: string;
      sections?: Array<{ title: string; content: string }>;
    };
    const title = payload.title?.trim() || "Proposition acceptee";
    const reportDate = new Date().toISOString().slice(0, 10);

    const { data: report, error: reportError } = await admin
      .from("reports")
      .insert([
        {
          org_id: proposal.org_id,
          student_id: proposal.student_id,
          title,
          report_date: reportDate,
          sent_at: new Date().toISOString(),
          coach_observations: payload.summary ?? null,
        },
      ])
      .select("id")
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: reportError?.message ?? "Creation du rapport impossible." },
        { status: 400 }
      );
    }

    const sections = payload.sections ?? [];
    const sectionsPayload = [
      {
        org_id: proposal.org_id,
        report_id: report.id,
        title: "Resume proposition",
        type: "text",
        content: payload.summary ?? "",
        position: 0,
      },
      ...sections.map((section, index) => ({
        org_id: proposal.org_id,
        report_id: report.id,
        title: section.title,
        type: "text",
        content: section.content,
        position: index + 1,
      })),
    ];

    await admin.from("report_sections").insert(sectionsPayload);
  }

  const { error: updateError } = await admin
    .from("org_proposals")
    .update({
      status: parsed.data.decision === "accept" ? "accepted" : "rejected",
      decided_at: new Date().toISOString(),
      decided_by: profile.id,
    })
    .eq("id", proposal.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await createOrgNotifications(admin, {
    orgId: proposal.org_id,
    userIds: [proposal.created_by],
    type:
      parsed.data.decision === "accept"
        ? "proposal.accepted"
        : "proposal.rejected",
    payload: { proposalId: proposal.id, studentId: proposal.student_id },
  });

  return NextResponse.json({ ok: true });
}
