import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import {
  TempoCreateDraftReportRequestSchema,
  TempoCreateDraftReportResponseSchema,
  type TempoDecisionAxis,
} from "@/lib/tempo/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const trimText = (value: string | null | undefined, max = 240) => {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "";
  if (text.length <= max) return text;
  const safeMax = Math.max(4, max);
  return `${text.slice(0, safeMax - 3).trim()}...`;
};

const formatDateTag = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildDefaultTitle = (studentName: string) => {
  const date = new Date().toLocaleDateString("fr-FR");
  return `Seance Tempo - ${studentName} - ${date}`;
};

const noteTypeLabel: Record<string, string> = {
  constat: "Constat",
  consigne: "Consigne",
  objectif: "Objectif",
  mesure: "Mesure",
  libre: "Note",
};

type DraftSectionSeed = {
  title: string;
  type: "text" | "image" | "video";
  content: string;
};

const appendSectionSeed = (
  target: DraftSectionSeed[],
  seed: DraftSectionSeed | null
) => {
  if (!seed) return;
  const normalizedTitle = seed.title.trim().toLowerCase();
  if (!normalizedTitle) return;
  if (target.some((item) => item.title.trim().toLowerCase() === normalizedTitle)) return;
  target.push(seed);
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const resolvedParams = await context.params;
  const parsedParams = paramsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Session Tempo invalide." }, { status: 422 });
  }

  const parsedBody = await parseRequestJson(request, TempoCreateDraftReportRequestSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("tempo_sessions")
    .select("id, student_id, org_id, coach_id, mode, title, club, status")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session Tempo introuvable." }, { status: 404 });
  }

  if (session.coach_id !== userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const canAccess = await canCoachLikeAccessStudent(admin, userId, session.student_id);
  if (!canAccess) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const [{ data: student }, { data: notes }, { data: decisionRuns }] = await Promise.all([
    admin
      .from("students")
      .select("id, first_name, last_name")
      .eq("id", session.student_id)
      .maybeSingle(),
    admin
      .from("tempo_note_cards")
      .select("id, occurred_at, card_type, content, order_index")
      .eq("session_id", session.id)
      .eq("coach_id", userId)
      .order("order_index", { ascending: true })
      .order("occurred_at", { ascending: true }),
    admin
      .from("tempo_decision_runs")
      .select("id, club, constat, coach_intent, axes_json, created_at")
      .eq("session_id", session.id)
      .eq("coach_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const latestDecision = decisionRuns?.[0] ?? null;
  const safeNotes = notes ?? [];
  if (safeNotes.length === 0 && !latestDecision) {
    return NextResponse.json(
      { error: "Ajoute des notes ou une decision Tempo avant de creer un brouillon." },
      { status: 422 }
    );
  }

  const studentName =
    [student?.first_name?.trim(), student?.last_name?.trim()].filter(Boolean).join(" ").trim() ||
    "Eleve";

  const notesLines = safeNotes.map((item) => {
    const typeLabel = noteTypeLabel[item.card_type] ?? "Note";
    const dateTag = formatDateTag(item.occurred_at);
    return `- ${dateTag ? `[${dateTag}] ` : ""}${typeLabel}: ${trimText(item.content, 2000)}`;
  });

  const observationParts = safeNotes
    .filter((item) => item.card_type === "constat" || item.card_type === "mesure")
    .map((item) => trimText(item.content, 4000));
  if (latestDecision?.constat) {
    observationParts.push(trimText(latestDecision.constat, 4000));
  }

  const workParts = safeNotes
    .filter((item) => item.card_type === "consigne" || item.card_type === "objectif")
    .map((item) => trimText(item.content, 4000));
  if (latestDecision?.coach_intent) {
    workParts.push(trimText(latestDecision.coach_intent, 4000));
  }

  const clubValue = trimText(session.club, 120) || trimText(latestDecision?.club, 120) || null;

  const axes = Array.isArray(latestDecision?.axes_json)
    ? (latestDecision?.axes_json as TempoDecisionAxis[])
    : [];
  const axesText =
    axes.length > 0
      ? axes
          .slice(0, 3)
          .map(
            (axis) =>
              `${axis.priority}. ${trimText(axis.title, 120)} - ${trimText(axis.summary, 320)}`
          )
          .join("\n")
      : "";

  const notesContent = notesLines.length > 0 ? notesLines.join("\n") : "";

  const reportTitle =
    parsedBody.data.title?.trim() || trimText(session.title, 180) || buildDefaultTitle(studentName);
  const reportDate = new Date().toISOString().slice(0, 10);

  const { data: report, error: reportInsertError } = await admin
    .from("reports")
    .insert([
      {
        org_id: session.org_id,
        student_id: session.student_id,
        author_id: userId,
        title: reportTitle,
        report_date: reportDate,
        coach_observations: observationParts.join("\n").trim() || null,
        coach_work: workParts.join("\n").trim() || null,
        coach_club: clubValue,
      },
    ])
    .select("id")
    .single();

  if (reportInsertError || !report?.id) {
    return NextResponse.json(
      { error: reportInsertError?.message ?? "Creation du brouillon impossible." },
      { status: 500 }
    );
  }

  const sectionSeeds: DraftSectionSeed[] = [];
  appendSectionSeed(
    sectionSeeds,
    notesContent
      ? {
          title: "Notes de seance",
          type: "text",
          content: notesContent,
        }
      : null
  );
  appendSectionSeed(
    sectionSeeds,
    axesText
      ? {
          title: "Axes de travail",
          type: "text",
          content: axesText,
        }
      : null
  );
  appendSectionSeed(
    sectionSeeds,
    observationParts.length > 0
      ? {
          title: "Diagnostic swing",
          type: "text",
          content: observationParts.join("\n"),
        }
      : null
  );
  appendSectionSeed(
    sectionSeeds,
    workParts.length > 0
      ? {
          title: "Objectifs de travail",
          type: "text",
          content: workParts.join("\n"),
        }
      : null
  );

  // Always enforce the core report structure.
  appendSectionSeed(sectionSeeds, {
    title: "Resume du rapport",
    type: "text",
    content: "",
  });
  appendSectionSeed(sectionSeeds, {
    title: "Planification 7 jours",
    type: "text",
    content: "",
  });
  appendSectionSeed(sectionSeeds, {
    title: "Images de la seance",
    type: "image",
    content: "",
  });
  appendSectionSeed(sectionSeeds, {
    title: "Video de reference",
    type: "video",
    content: "",
  });

  let hasVideoSection = false;
  const normalizedSectionSeeds = sectionSeeds.filter((seed) => {
    if (seed.type !== "video") return true;
    if (hasVideoSection) return false;
    hasVideoSection = true;
    return true;
  });

  const sectionsPayload: Array<{
    org_id: string;
    report_id: string;
    title: string;
    content: string;
    position: number;
    type: string;
  }> = normalizedSectionSeeds.map((seed, index) => ({
    org_id: session.org_id,
    report_id: report.id,
    title: seed.title,
    content: seed.content,
    position: index,
    type: seed.type,
  }));

  const { error: sectionInsertError } = await admin.from("report_sections").insert(sectionsPayload);
  if (sectionInsertError) {
    return NextResponse.json(
      { error: sectionInsertError.message ?? "Creation des sections impossible." },
      { status: 500 }
    );
  }

  await recordActivity({
    admin,
    action: "tempo.draft_report.created",
    actorUserId: userId,
    orgId: session.org_id,
    entityType: "report",
    entityId: report.id,
    message: "Brouillon rapport cree depuis Tempo.",
    metadata: {
      studentId: session.student_id,
      tempoSessionId: session.id,
      notesCount: safeNotes.length,
      axesCount: axes.length,
    },
  }).catch(() => null);

  const payload = TempoCreateDraftReportResponseSchema.parse({
    reportId: report.id,
  });
  return NextResponse.json(payload, { status: 201 });
}
