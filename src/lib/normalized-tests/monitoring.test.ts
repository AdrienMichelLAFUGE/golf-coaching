import {
  buildNormalizedTestsSummary,
  type NormalizedTestAssignment,
  type NormalizedTestAttempt,
  getNormalizedTestDescription,
} from "@/lib/normalized-tests/monitoring";
import { PELZ_PUTTING_SLUG } from "@/lib/normalized-tests/pelz-putting";

const mkAssignment = (
  partial: Partial<NormalizedTestAssignment> & { id: string }
): NormalizedTestAssignment => ({
  id: partial.id,
  test_slug: partial.test_slug ?? PELZ_PUTTING_SLUG,
  status: partial.status ?? "assigned",
  assigned_at: partial.assigned_at ?? "2026-02-09T10:00:00Z",
  started_at: partial.started_at ?? null,
  finalized_at: partial.finalized_at ?? null,
  archived_at: partial.archived_at ?? null,
  updated_at: partial.updated_at ?? "2026-02-09T10:00:00Z",
  index_or_flag_label: partial.index_or_flag_label ?? null,
  clubs_used: partial.clubs_used ?? null,
});

const mkAttempt = (
  partial: Partial<NormalizedTestAttempt> & { id: string; assignment_id: string }
): NormalizedTestAttempt => ({
  id: partial.id,
  assignment_id: partial.assignment_id,
  subtest_key: partial.subtest_key ?? "any",
  attempt_index: partial.attempt_index ?? 1,
  result_value: partial.result_value ?? "any",
  points: partial.points ?? 0,
  created_at: partial.created_at ?? "2026-02-09T10:00:00Z",
});

describe("buildNormalizedTestsSummary", () => {
  it("returns empty lists when no assignments", () => {
    const summary = buildNormalizedTestsSummary([], []);
    expect(summary.current).toEqual([]);
    expect(summary.history).toEqual([]);
  });

  it("splits current vs history based on status and archived", () => {
    const a1 = mkAssignment({ id: "00000000-0000-0000-0000-000000000001", status: "assigned" });
    const a2 = mkAssignment({
      id: "00000000-0000-0000-0000-000000000002",
      status: "in_progress",
      updated_at: "2026-02-09T11:00:00Z",
    });
    const a3 = mkAssignment({
      id: "00000000-0000-0000-0000-000000000003",
      status: "finalized",
      finalized_at: "2026-02-09T12:00:00Z",
      updated_at: "2026-02-09T12:00:00Z",
    });
    const a4 = mkAssignment({
      id: "00000000-0000-0000-0000-000000000004",
      status: "assigned",
      archived_at: "2026-02-09T13:00:00Z",
      updated_at: "2026-02-09T13:00:00Z",
    });

    const summary = buildNormalizedTestsSummary([a1, a2, a3, a4], []);
    expect(summary.current.map((x) => x.assignmentId)).toEqual([a2.id, a1.id]);
    expect(summary.history.map((x) => x.assignmentId)).toEqual([a4.id, a3.id]);
  });

  it("uses attempts to compute lastActivityAt and attemptsCount", () => {
    const assignmentId = "00000000-0000-0000-0000-000000000010";
    const assignment = mkAssignment({
      id: assignmentId,
      status: "in_progress",
      updated_at: "2026-02-09T10:05:00Z",
    });
    const attempts = [
      mkAttempt({
        id: "00000000-0000-0000-0000-000000000011",
        assignment_id: assignmentId,
        created_at: "2026-02-09T10:10:00Z",
      }),
      mkAttempt({
        id: "00000000-0000-0000-0000-000000000012",
        assignment_id: assignmentId,
        created_at: "2026-02-09T10:20:00Z",
      }),
    ];

    const summary = buildNormalizedTestsSummary([assignment], attempts);
    expect(summary.current).toHaveLength(1);
    expect(summary.current[0]?.attemptsCount).toBe(2);
    expect(summary.current[0]?.lastActivityAt).toBe("2026-02-09T10:20:00Z");
  });
});

describe("getNormalizedTestDescription", () => {
  it("returns a non-empty description for a known slug", () => {
    expect(getNormalizedTestDescription(PELZ_PUTTING_SLUG).trim().length).toBeGreaterThan(
      0
    );
  });
});
