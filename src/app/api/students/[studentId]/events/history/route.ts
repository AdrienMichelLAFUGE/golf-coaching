import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStudentEventAccess } from "@/lib/student-events/access";
import {
  STUDENT_EVENT_SELECT,
  StudentEventRowSchema,
  StudentEventsRouteParamsSchema,
  mapStudentEventRowToDto,
} from "@/lib/student-events/schemas";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError } from "@/lib/validation";

type Params = { params: { studentId: string } | Promise<{ studentId: string }> };

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: Request, { params }: Params) {
  const { studentId } = await params;
  const parsedParams = StudentEventsRouteParamsSchema.safeParse({ studentId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = HistoryQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedQuery.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const access = await resolveStudentEventAccess(
    admin,
    userData.user.id,
    parsedParams.data.studentId,
    userData.user.email ?? null
  );
  if (!access.canRead) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const pageSize = parsedQuery.data.limit;
  const cursor = parsedQuery.data.cursor ?? null;

  let query = admin
    .from("student_events")
    .select(STUDENT_EVENT_SELECT)
    .eq("student_id", parsedParams.data.studentId)
    .in("type", ["tournament", "competition"])
    .eq("results_enabled", true)
    .order("start_at", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.lt("start_at", cursor);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const parsedRows = z.array(StudentEventRowSchema).safeParse((data ?? []) as unknown[]);
  if (!parsedRows.success) {
    return NextResponse.json({ error: "Evenements invalides." }, { status: 500 });
  }

  const hasMore = parsedRows.data.length > pageSize;
  const pageRows = hasMore ? parsedRows.data.slice(0, pageSize) : parsedRows.data;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.start_at ?? null : null;

  return NextResponse.json({
    events: pageRows.map(mapStudentEventRowToDto),
    nextCursor,
    hasMore,
  });
}

