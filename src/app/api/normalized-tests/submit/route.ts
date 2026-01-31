import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import {
  PELZ_PUTTING_SLUG,
  type PelzResultValue,
  type PelzSubtestKey,
  getPelzResultPoints,
  isPelzResultValue,
} from "@/lib/normalized-tests/pelz-putting";

export const runtime = "nodejs";

const subtestKeys = [
  "putt_long",
  "putt_moyen",
  "putt_pente",
  "putt_offensif",
  "putt_court_1m",
  "putt_court_2m",
] as const;

const attemptSchema = z.object({
  index: z.number().int().min(1).max(10),
  result: z.string().min(1),
});

const submitSchema = z.object({
  assignmentId: z.string().uuid(),
  finalize: z.boolean().optional(),
  indexLabel: z.string().trim().max(80).optional(),
  subtests: z
    .array(
      z.object({
        key: z.enum(subtestKeys),
        attempts: z.array(attemptSchema),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, submitSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const userEmail = userData.user?.email ?? "";

  if (userError || !userId || !userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (profile.role !== "student") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, email")
    .ilike("email", userEmail)
    .maybeSingle();

  if (studentError || !student) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: assignment, error: assignmentError } = await admin
    .from("normalized_test_assignments")
    .select("id, student_id, test_slug, status, started_at")
    .eq("id", parsed.data.assignmentId)
    .single();

  if (assignmentError || !assignment) {
    return NextResponse.json({ error: "Test introuvable." }, { status: 404 });
  }

  if (assignment.student_id !== student.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (assignment.test_slug !== PELZ_PUTTING_SLUG) {
    return NextResponse.json({ error: "Test non supporte." }, { status: 400 });
  }

  if (assignment.status === "finalized") {
    return NextResponse.json({ error: "Test deja finalise." }, { status: 409 });
  }

  const finalize = parsed.data.finalize ?? false;
  const subtestsByKey = new Map<PelzSubtestKey, z.infer<typeof attemptSchema>[]>();

  for (const subtest of parsed.data.subtests) {
    const key = subtest.key as PelzSubtestKey;
    const seen = new Set<number>();
    for (const attempt of subtest.attempts) {
      if (seen.has(attempt.index)) {
        return NextResponse.json(
          { error: `Tentative en double pour ${key}.` },
          { status: 422 }
        );
      }
      if (!isPelzResultValue(key, attempt.result)) {
        return NextResponse.json(
          { error: `Resultat invalide pour ${key}.` },
          { status: 422 }
        );
      }
      seen.add(attempt.index);
    }
    subtestsByKey.set(key, subtest.attempts);
  }

  if (finalize) {
    const missingSubtests = subtestKeys.filter((key) => !subtestsByKey.has(key));
    if (missingSubtests.length > 0) {
      return NextResponse.json(
        { error: "Tous les sous-tests doivent etre completes pour finaliser." },
        { status: 422 }
      );
    }
    for (const key of subtestKeys) {
      const attempts = subtestsByKey.get(key as PelzSubtestKey) ?? [];
      if (attempts.length !== 10) {
        return NextResponse.json(
          { error: "Chaque sous-test doit contenir 10 tentatives." },
          { status: 422 }
        );
      }
    }
  }

  const now = new Date().toISOString();
  const attemptRows = Array.from(subtestsByKey.entries()).flatMap(([key, attempts]) =>
    attempts.map((attempt) => ({
      assignment_id: assignment.id,
      subtest_key: key,
      attempt_index: attempt.index,
      result_value: attempt.result,
      points: getPelzResultPoints(key, attempt.result as PelzResultValue),
      created_at: now,
      updated_at: now,
    }))
  );

  const { error: deleteError } = await admin
    .from("normalized_test_attempts")
    .delete()
    .eq("assignment_id", assignment.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (attemptRows.length > 0) {
    const { error: insertError } = await admin
      .from("normalized_test_attempts")
      .insert(attemptRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const updates: Record<string, string | null> = {
    updated_at: now,
  };

  if (typeof parsed.data.indexLabel === "string") {
    updates.index_or_flag_label = parsed.data.indexLabel.trim() || null;
  }

  if (finalize) {
    updates.status = "finalized";
    updates.finalized_at = now;
  } else if (attemptRows.length > 0) {
    if (!assignment.started_at) {
      updates.started_at = now;
    }
    if (assignment.status === "assigned") {
      updates.status = "in_progress";
    }
  }

  const { error: updateError } = await admin
    .from("normalized_test_assignments")
    .update(updates)
    .eq("id", assignment.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    assignment: {
      id: assignment.id,
      status: updates.status ?? assignment.status,
      finalized_at: updates.finalized_at ?? null,
    },
  });
}
