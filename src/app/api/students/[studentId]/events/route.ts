import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { resolveStudentEventAccess } from "@/lib/student-events/access";
import {
  CreateStudentEventBodySchema,
  StudentEventRowSchema,
  StudentEventsRangeQuerySchema,
  StudentEventsRouteParamsSchema,
  STUDENT_EVENT_SELECT,
  buildCreateInsertPayload,
  mapStudentEventRowToDto,
} from "@/lib/student-events/schemas";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type Params = { params: { studentId: string } | Promise<{ studentId: string }> };

const parseRows = (rows: unknown[]) => {
  const parsedRows = z.array(StudentEventRowSchema).safeParse(rows);
  if (!parsedRows.success) return null;
  return parsedRows.data.map(mapStudentEventRowToDto);
};

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
  const parsedQuery = StudentEventsRangeQuerySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
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

  const { data, error } = await admin
    .from("student_events")
    .select(STUDENT_EVENT_SELECT)
    .eq("student_id", parsedParams.data.studentId)
    .gte("start_at", parsedQuery.data.from)
    .lte("start_at", parsedQuery.data.to)
    .order("start_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const events = parseRows((data ?? []) as unknown[]);
  if (!events) {
    return NextResponse.json({ error: "Evenements invalides." }, { status: 500 });
  }

  return NextResponse.json({ events });
}

export async function POST(request: Request, { params }: Params) {
  const { studentId } = await params;
  const parsedParams = StudentEventsRouteParamsSchema.safeParse({ studentId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const parsedBody = await parseRequestJson(request, CreateStudentEventBodySchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
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
  if (!access.canWrite) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const insertPayload = buildCreateInsertPayload(
    parsedBody.data,
    parsedParams.data.studentId,
    userData.user.id
  );

  const { data, error } = await admin
    .from("student_events")
    .insert(insertPayload)
    .select(STUDENT_EVENT_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const parsedEvent = StudentEventRowSchema.safeParse(data);
  if (!parsedEvent.success) {
    return NextResponse.json({ error: "Evenement invalide." }, { status: 500 });
  }

  return NextResponse.json(
    { event: mapStudentEventRowToDto(parsedEvent.data) },
    { status: 201 }
  );
}
