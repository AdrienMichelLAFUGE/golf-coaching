import { z } from "zod";
import { PELZ_PUTTING_TEST, PELZ_PUTTING_SLUG } from "@/lib/normalized-tests/pelz-putting";
import {
  PELZ_APPROCHES_TEST,
  PELZ_APPROCHES_SLUG,
} from "@/lib/normalized-tests/pelz-approches";
import {
  WEDGING_DRAPEAU_LONG_TEST,
  WEDGING_DRAPEAU_LONG_SLUG,
} from "@/lib/normalized-tests/wedging-drapeau-long";
import {
  WEDGING_DRAPEAU_COURT_TEST,
  WEDGING_DRAPEAU_COURT_SLUG,
} from "@/lib/normalized-tests/wedging-drapeau-court";

export const NormalizedTestSlugSchema = z.union([
  z.literal(PELZ_PUTTING_SLUG),
  z.literal(PELZ_APPROCHES_SLUG),
  z.literal(WEDGING_DRAPEAU_LONG_SLUG),
  z.literal(WEDGING_DRAPEAU_COURT_SLUG),
]);

export type NormalizedTestSlug = z.infer<typeof NormalizedTestSlugSchema>;

export const NormalizedTestAssignmentStatusSchema = z.enum([
  "assigned",
  "in_progress",
  "finalized",
]);

export type NormalizedTestAssignmentStatus = z.infer<
  typeof NormalizedTestAssignmentStatusSchema
>;

// Note: timestamps come from Postgres via Supabase and may include offsets.
const TimestampSchema = z.string().min(1);

export const NormalizedTestAssignmentSchema = z.object({
  id: z.string().uuid(),
  test_slug: NormalizedTestSlugSchema,
  status: NormalizedTestAssignmentStatusSchema,
  assigned_at: TimestampSchema,
  started_at: TimestampSchema.nullable().optional(),
  finalized_at: TimestampSchema.nullable().optional(),
  archived_at: TimestampSchema.nullable().optional(),
  updated_at: TimestampSchema,
  index_or_flag_label: z.string().nullable().optional(),
  clubs_used: z.string().nullable().optional(),
});

export type NormalizedTestAssignment = z.infer<typeof NormalizedTestAssignmentSchema>;

export const NormalizedTestAttemptSchema = z.object({
  id: z.string().uuid(),
  assignment_id: z.string().uuid(),
  subtest_key: z.string().min(1),
  attempt_index: z.number().int().min(1).max(18),
  result_value: z.string().min(1),
  points: z.number().int(),
  created_at: TimestampSchema,
});

export type NormalizedTestAttempt = z.infer<typeof NormalizedTestAttemptSchema>;

export const getNormalizedTestTitle = (slug: NormalizedTestSlug): string => {
  switch (slug) {
    case PELZ_PUTTING_SLUG:
      return PELZ_PUTTING_TEST.title;
    case PELZ_APPROCHES_SLUG:
      return PELZ_APPROCHES_TEST.title;
    case WEDGING_DRAPEAU_LONG_SLUG:
      return WEDGING_DRAPEAU_LONG_TEST.title;
    case WEDGING_DRAPEAU_COURT_SLUG:
      return WEDGING_DRAPEAU_COURT_TEST.title;
  }
};

export const getNormalizedTestDescription = (slug: NormalizedTestSlug): string => {
  switch (slug) {
    case PELZ_PUTTING_SLUG:
      return PELZ_PUTTING_TEST.description;
    case PELZ_APPROCHES_SLUG:
      return PELZ_APPROCHES_TEST.description;
    case WEDGING_DRAPEAU_LONG_SLUG:
      return WEDGING_DRAPEAU_LONG_TEST.description;
    case WEDGING_DRAPEAU_COURT_SLUG:
      return WEDGING_DRAPEAU_COURT_TEST.description;
  }
};

export type NormalizedTestMonitoringItem = {
  assignmentId: string;
  slug: NormalizedTestSlug;
  title: string;
  status: NormalizedTestAssignmentStatus;
  assignedAt: string;
  startedAt: string | null;
  finalizedAt: string | null;
  archivedAt: string | null;
  lastActivityAt: string;
  attemptsCount: number;
  indexOrFlagLabel: string | null;
  clubsUsed: string | null;
};

export type NormalizedTestMonitoringSummary = {
  current: NormalizedTestMonitoringItem[];
  history: NormalizedTestMonitoringItem[];
};

const maxTimestamp = (timestamps: string[], fallback: string) => {
  let best = fallback;
  let bestTime = new Date(fallback).getTime();
  for (const ts of timestamps) {
    const time = new Date(ts).getTime();
    if (!Number.isFinite(time)) continue;
    if (!Number.isFinite(bestTime) || time > bestTime) {
      best = ts;
      bestTime = time;
    }
  }
  return best;
};

export const buildNormalizedTestsSummary = (
  assignments: NormalizedTestAssignment[],
  attempts: NormalizedTestAttempt[]
): NormalizedTestMonitoringSummary => {
  const attemptsByAssignment = new Map<string, NormalizedTestAttempt[]>();
  for (const attempt of attempts) {
    const existing = attemptsByAssignment.get(attempt.assignment_id);
    if (existing) existing.push(attempt);
    else attemptsByAssignment.set(attempt.assignment_id, [attempt]);
  }

  const items: NormalizedTestMonitoringItem[] = assignments.map((assignment) => {
    const relatedAttempts = attemptsByAssignment.get(assignment.id) ?? [];
    const lastActivityAt = maxTimestamp(
      [assignment.updated_at, ...relatedAttempts.map((a) => a.created_at)],
      assignment.assigned_at
    );

    return {
      assignmentId: assignment.id,
      slug: assignment.test_slug,
      title: getNormalizedTestTitle(assignment.test_slug),
      status: assignment.status,
      assignedAt: assignment.assigned_at,
      startedAt: assignment.started_at ?? null,
      finalizedAt: assignment.finalized_at ?? null,
      archivedAt: assignment.archived_at ?? null,
      lastActivityAt,
      attemptsCount: relatedAttempts.length,
      indexOrFlagLabel: assignment.index_or_flag_label ?? null,
      clubsUsed: assignment.clubs_used ?? null,
    };
  });

  // Keep the UI stable: most recent activity first.
  items.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  const current = items.filter(
    (item) => item.archivedAt == null && item.status !== "finalized"
  );
  const history = items.filter(
    (item) => item.status === "finalized" || item.archivedAt != null
  );

  return { current, history };
};
