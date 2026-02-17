import { NextResponse } from "next/server";
import { z } from "zod";
import { loadParentLinkedStudentContext } from "@/lib/parent/access";
import { formatZodError } from "@/lib/validation";

type Params = { params: { id: string } | Promise<{ id: string }> };

const paramsSchema = z.object({
  id: z.string().uuid(),
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

  const { data: assignmentsData, error: assignmentsError } = await loaded.context.admin
    .from("normalized_test_assignments")
    .select("id, student_id, test_slug, status, assigned_at, updated_at, archived_at")
    .eq("student_id", loaded.context.studentId)
    .is("archived_at", null)
    .order("assigned_at", { ascending: false });

  if (assignmentsError) {
    return NextResponse.json(
      { error: "Chargement des tests impossible." },
      { status: 400 }
    );
  }

  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  const assignmentIds = assignments.map((assignment) => assignment.id);

  const attemptsByAssignment = new Map<string, AttemptRow[]>();
  if (assignmentIds.length > 0) {
    const { data: attemptsData } = await loaded.context.admin
      .from("normalized_test_attempts")
      .select("id, assignment_id, created_at")
      .in("assignment_id", assignmentIds)
      .order("created_at", { ascending: false });

    ((attemptsData ?? []) as AttemptRow[]).forEach((attempt) => {
      const current = attemptsByAssignment.get(attempt.assignment_id) ?? [];
      current.push(attempt);
      attemptsByAssignment.set(attempt.assignment_id, current);
    });
  }

  return NextResponse.json({
    assignments: assignments.map((assignment) => {
      const attempts = attemptsByAssignment.get(assignment.id) ?? [];
      return {
        id: assignment.id,
        testSlug: assignment.test_slug,
        status: assignment.status,
        assignedAt: assignment.assigned_at,
        updatedAt: assignment.updated_at,
        attemptsCount: attempts.length,
        lastAttemptAt: attempts[0]?.created_at ?? null,
      };
    }),
  });
}
