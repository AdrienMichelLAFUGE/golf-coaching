import { NextResponse } from "next/server";
import { z } from "zod";
import {
  loadParentLinkedStudentContext,
  loadParentLinkedStudentIds,
} from "@/lib/parent/access";
import { formatZodError } from "@/lib/validation";

type Params = { params: { id: string } | Promise<{ id: string }> };

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
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

  const { data, error } = await loaded.context.admin
    .from("reports")
    .select("id, title, report_date, created_at, sent_at")
    .in("student_id", studentIds)
    .not("sent_at", "is", null)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Chargement des rapports impossible." },
      { status: 400 }
    );
  }

  const reports = ((data ?? []) as ReportRow[]).map((report) => ({
    id: report.id,
    title: report.title,
    reportDate: report.report_date,
    createdAt: report.created_at,
    sentAt: report.sent_at,
  }));

  return NextResponse.json({ reports });
}
