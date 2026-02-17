import { NextResponse } from "next/server";
import { z } from "zod";
import { loadParentLinkedStudentContext } from "@/lib/parent/access";
import { formatZodError } from "@/lib/validation";

type Params = {
  params:
    | { id: string; assignmentId: string }
    | Promise<{ id: string; assignmentId: string }>;
};

const paramsSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

type AssignmentRow = {
  id: string;
  student_id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AttemptRow = {
  id: string;
  assignment_id: string;
  answers: unknown;
  score: number | null;
  summary: string | null;
  created_at: string;
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

  const { data: assignmentData, error: assignmentError } = await loaded.context.admin
    .from("normalized_test_assignments")
    .select("id, student_id, test_slug, status, assigned_at, updated_at, archived_at")
    .eq("id", parsedParams.data.assignmentId)
    .eq("student_id", loaded.context.studentId)
    .is("archived_at", null)
    .maybeSingle();

  const assignment = (assignmentData as AssignmentRow | null) ?? null;
  if (assignmentError || !assignment) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: attemptsData, error: attemptsError } = await loaded.context.admin
    .from("normalized_test_attempts")
    .select("id, assignment_id, answers, score, summary, created_at")
    .eq("assignment_id", assignment.id)
    .order("created_at", { ascending: false });

  if (attemptsError) {
    return NextResponse.json(
      { error: "Chargement du test impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    assignment: {
      id: assignment.id,
      testSlug: assignment.test_slug,
      status: assignment.status,
      assignedAt: assignment.assigned_at,
      updatedAt: assignment.updated_at,
    },
    attempts: ((attemptsData ?? []) as AttemptRow[]).map((attempt) => ({
      id: attempt.id,
      score: attempt.score,
      summary: attempt.summary,
      answers: attempt.answers,
      createdAt: attempt.created_at,
    })),
  });
}
