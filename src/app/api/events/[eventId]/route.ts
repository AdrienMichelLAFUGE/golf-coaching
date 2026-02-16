import { NextResponse } from "next/server";
import { resolveStudentEventAccess } from "@/lib/student-events/access";
import {
  EventRouteParamsSchema,
  STUDENT_EVENT_SELECT,
  StudentEventRowSchema,
  UpdateStudentEventBodySchema,
  buildUpdatePatchPayload,
  mapStudentEventRowToDto,
} from "@/lib/student-events/schemas";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type Params = { params: { eventId: string } | Promise<{ eventId: string }> };

const loadEventRow = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  eventId: string
) => {
  const { data, error } = await admin
    .from("student_events")
    .select(STUDENT_EVENT_SELECT)
    .eq("id", eventId)
    .maybeSingle();

  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };

  const parsed = StudentEventRowSchema.safeParse(data);
  if (!parsed.success) return { row: null, error: null };
  return { row: parsed.data, error: null };
};

export async function PATCH(request: Request, { params }: Params) {
  const { eventId } = await params;
  const parsedParams = EventRouteParamsSchema.safeParse({ eventId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const parsedBody = await parseRequestJson(request, UpdateStudentEventBodySchema);
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
  const loaded = await loadEventRow(admin, parsedParams.data.eventId);
  if (loaded.error) {
    return NextResponse.json({ error: loaded.error.message }, { status: 400 });
  }
  if (!loaded.row) {
    return NextResponse.json({ error: "Evenement introuvable." }, { status: 404 });
  }

  const access = await resolveStudentEventAccess(
    admin,
    userData.user.id,
    loaded.row.student_id,
    userData.user.email ?? null
  );
  if (!access.canWrite) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (parsedBody.data.version !== loaded.row.version) {
    return NextResponse.json(
      {
        error: "Version conflict.",
        event: mapStudentEventRowToDto(loaded.row),
      },
      { status: 409 }
    );
  }

  const nextStartAt = parsedBody.data.startAt ?? loaded.row.start_at;
  const nextEndAt =
    parsedBody.data.endAt === undefined ? loaded.row.end_at : parsedBody.data.endAt ?? null;

  if (nextEndAt && Date.parse(nextEndAt) < Date.parse(nextStartAt)) {
    return NextResponse.json(
      {
        error: "Payload invalide.",
        details: {
          message: "Invalid payload.",
          fields: { endAt: ["La date de fin doit etre apres la date de debut."] },
          formErrors: [],
        },
      },
      { status: 422 }
    );
  }

  const updatePayload = {
    ...buildUpdatePatchPayload(parsedBody.data, userData.user.id),
    version: loaded.row.version + 1,
  };

  const { data, error } = await admin
    .from("student_events")
    .update(updatePayload)
    .eq("id", parsedParams.data.eventId)
    .eq("version", loaded.row.version)
    .select(STUDENT_EVENT_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    const latest = await loadEventRow(admin, parsedParams.data.eventId);
    if (!latest.row) {
      return NextResponse.json({ error: "Evenement introuvable." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Version conflict.", event: mapStudentEventRowToDto(latest.row) },
      { status: 409 }
    );
  }

  const parsedEvent = StudentEventRowSchema.safeParse(data);
  if (!parsedEvent.success) {
    return NextResponse.json({ error: "Evenement invalide." }, { status: 500 });
  }

  return NextResponse.json({ event: mapStudentEventRowToDto(parsedEvent.data) });
}

export async function DELETE(request: Request, { params }: Params) {
  const { eventId } = await params;
  const parsedParams = EventRouteParamsSchema.safeParse({ eventId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const loaded = await loadEventRow(admin, parsedParams.data.eventId);
  if (loaded.error) {
    return NextResponse.json({ error: loaded.error.message }, { status: 400 });
  }
  if (!loaded.row) {
    return NextResponse.json({ error: "Evenement introuvable." }, { status: 404 });
  }

  const access = await resolveStudentEventAccess(
    admin,
    userData.user.id,
    loaded.row.student_id,
    userData.user.email ?? null
  );
  if (!access.canWrite) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { error } = await admin
    .from("student_events")
    .delete()
    .eq("id", parsedParams.data.eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
