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
import {
  PELZ_APPROCHES_SLUG,
  type PelzApprochesResultValue,
  type PelzApprochesSubtestKey,
  getPelzApprochesResultPoints,
  isPelzApprochesResultValue,
} from "@/lib/normalized-tests/pelz-approches";

export const runtime = "nodejs";

const puttingSubtestKeys = [
  "putt_long",
  "putt_moyen",
  "putt_pente",
  "putt_offensif",
  "putt_court_1m",
  "putt_court_2m",
] as const;

const approchesSubtestKeys = [
  "approche_levee",
  "chip_long",
  "chip_court",
  "wedging_50m",
  "bunker_court",
  "wedging_30m",
  "bunker_long",
  "approche_mi_distance",
  "approche_rough",
] as const;

const allSubtestKeys = [...puttingSubtestKeys, ...approchesSubtestKeys] as [
  string,
  ...string[],
];

type AllSubtestKey = PelzSubtestKey | PelzApprochesSubtestKey;

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
        key: z.enum(allSubtestKeys),
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

  type TestConfig = {
    subtestKeys: readonly AllSubtestKey[];
    isResultValue: (key: AllSubtestKey, value: string) => boolean;
    getPoints: (key: AllSubtestKey, value: string) => number;
  };

  const testConfigBySlug: Record<string, TestConfig> = {
    [PELZ_PUTTING_SLUG]: {
      subtestKeys: puttingSubtestKeys,
      isResultValue: (key, value) => isPelzResultValue(key as PelzSubtestKey, value),
      getPoints: (key, value) =>
        getPelzResultPoints(key as PelzSubtestKey, value as PelzResultValue),
    },
    [PELZ_APPROCHES_SLUG]: {
      subtestKeys: approchesSubtestKeys,
      isResultValue: (key, value) =>
        isPelzApprochesResultValue(key as PelzApprochesSubtestKey, value),
      getPoints: (key, value) =>
        getPelzApprochesResultPoints(
          key as PelzApprochesSubtestKey,
          value as PelzApprochesResultValue
        ),
    },
  };

  const testConfig =
    testConfigBySlug[assignment.test_slug as keyof typeof testConfigBySlug];

  if (!testConfig) {
    return NextResponse.json({ error: "Test non supporte." }, { status: 400 });
  }

  if (assignment.status === "finalized") {
    return NextResponse.json({ error: "Test deja finalise." }, { status: 409 });
  }

  const finalize = parsed.data.finalize ?? false;
  const allowedKeys = new Set<AllSubtestKey>(testConfig.subtestKeys);
  const subtestsByKey = new Map<AllSubtestKey, z.infer<typeof attemptSchema>[]>();

  for (const subtest of parsed.data.subtests) {
    const key = subtest.key as AllSubtestKey;
    if (!allowedKeys.has(key)) {
      return NextResponse.json({ error: `Sous-test invalide: ${key}.` }, { status: 422 });
    }
    const seen = new Set<number>();
    for (const attempt of subtest.attempts) {
      if (seen.has(attempt.index)) {
        return NextResponse.json(
          { error: `Tentative en double pour ${key}.` },
          { status: 422 }
        );
      }
      if (!testConfig.isResultValue(key, attempt.result)) {
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
    const missingSubtests = testConfig.subtestKeys.filter(
      (key) => !subtestsByKey.has(key)
    );
    if (missingSubtests.length > 0) {
      return NextResponse.json(
        { error: "Tous les sous-tests doivent etre completes pour finaliser." },
        { status: 422 }
      );
    }
    for (const key of testConfig.subtestKeys) {
      const attempts = subtestsByKey.get(key as AllSubtestKey) ?? [];
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
      points: testConfig.getPoints(key, attempt.result),
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
