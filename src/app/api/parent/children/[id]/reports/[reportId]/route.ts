import { NextResponse } from "next/server";
import { z } from "zod";
import {
  loadParentLinkedStudentContext,
  loadParentLinkedStudentIds,
} from "@/lib/parent/access";
import { formatZodError } from "@/lib/validation";

type Params = {
  params:
    | { id: string; reportId: string }
    | Promise<{ id: string; reportId: string }>;
};

const paramsSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
});

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
  coach_observations: string | null;
  coach_work: string | null;
  coach_club: string | null;
  student_id: string;
};

type SectionRow = {
  id: string;
  title: string;
  type: string | null;
  content: string | null;
  content_formatted: string | null;
  media_urls: string[] | null;
  media_captions: string[] | null;
  position: number;
};

export async function GET(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const loaded = await loadParentLinkedStudentContext(request, parsedParams.data.id);
  if (!loaded.context) {
    return NextResponse.json(
      { error: loaded.failure?.error ?? "Acces refuse." },
      { status: loaded.failure?.status ?? 403 }
    );
  }

  const studentIds = await loadParentLinkedStudentIds(
    loaded.context.admin,
    loaded.context.studentId
  );

  const { data: reportData, error: reportError } = await loaded.context.admin
    .from("reports")
    .select(
      "id, title, report_date, created_at, sent_at, coach_observations, coach_work, coach_club, student_id"
    )
    .eq("id", parsedParams.data.reportId)
    .in("student_id", studentIds)
    .maybeSingle();

  const report = (reportData as ReportRow | null) ?? null;
  if (reportError || !report || !report.sent_at) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: sectionsData, error: sectionsError } = await loaded.context.admin
    .from("report_sections")
    .select(
      "id, title, type, content, content_formatted, media_urls, media_captions, position"
    )
    .eq("report_id", report.id)
    .order("position", { ascending: true });

  if (sectionsError) {
    return NextResponse.json(
      { error: "Chargement du rapport impossible." },
      { status: 400 }
    );
  }

  const sections = ((sectionsData ?? []) as SectionRow[]).map((section) => ({
    id: section.id,
    title: section.title,
    type: section.type,
    content: section.content,
    contentFormatted: section.content_formatted,
    mediaUrls: section.media_urls ?? [],
    mediaCaptions: section.media_captions ?? [],
    position: section.position,
  }));

  return NextResponse.json({
    report: {
      id: report.id,
      title: report.title,
      reportDate: report.report_date,
      createdAt: report.created_at,
      sentAt: report.sent_at,
      coachObservations: report.coach_observations,
      coachWork: report.coach_work,
      coachClub: report.coach_club,
    },
    sections,
  });
}
