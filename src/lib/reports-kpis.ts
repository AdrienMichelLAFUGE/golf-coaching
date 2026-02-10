import { z } from "zod";

const TimestampSchema = z.string().min(1);
const DateSchema = z.string().min(1);

export const ReportKpiRowSchema = z.object({
  id: z.string().uuid(),
  // Reports can be saved with an empty title (DB constraint is NOT NULL, but not non-empty).
  title: z.string(),
  created_at: TimestampSchema,
  report_date: DateSchema.nullable(),
  sent_at: TimestampSchema.nullable().optional(),
  org_id: z.string().uuid(),
  organizations: z
    .union([
      z.array(z.object({ name: z.string().nullable() })),
      z.object({ name: z.string().nullable() }),
    ])
    .nullable()
    .optional(),
  coach_observations: z.string().nullable().optional(),
  coach_work: z.string().nullable().optional(),
  coach_club: z.string().nullable().optional(),
});

export type ReportKpiRow = z.infer<typeof ReportKpiRowSchema>;

export type ReportTimeLike = { created_at: string; report_date: string | null };
export type ReportClubsLike = ReportTimeLike & { coach_club?: string | null | undefined };
export type ReportContentLike = ReportTimeLike & {
  coach_observations?: string | null | undefined;
  coach_work?: string | null | undefined;
};

export const pickReportTime = (report: ReportTimeLike) => {
  const raw = report.report_date ?? report.created_at;
  const time = new Date(raw).getTime();
  // Guard: if report_date is a date-only string, Date(...) still works; otherwise fallback to created_at.
  if (!Number.isFinite(time)) return new Date(report.created_at).getTime();
  return time;
};

export const computeMedianCadenceDays = <T extends ReportTimeLike>(
  reportsNewestFirst: T[],
  max = 5
) => {
  const items = reportsNewestFirst.slice(0, max);
  if (items.length < 2) return null;

  const deltas: number[] = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    const a = pickReportTime(items[i]!);
    const b = pickReportTime(items[i + 1]!);
    const deltaDays = Math.max(0, Math.round((a - b) / (1000 * 60 * 60 * 24)));
    if (Number.isFinite(deltaDays) && deltaDays > 0) deltas.push(deltaDays);
  }
  if (deltas.length === 0) return null;
  deltas.sort((x, y) => x - y);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? Math.round((deltas[mid - 1]! + deltas[mid]!) / 2)
    : deltas[mid]!;
};

const normalizeClubToken = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[-*•]\s+/, "")
    .toLowerCase();

export const extractTopClubs = <T extends ReportClubsLike>(
  reportsNewestFirst: T[],
  maxReports = 5,
  top = 3
) => {
  const counts = new Map<string, { count: number; display: string }>();
  const items = reportsNewestFirst.slice(0, maxReports);

  for (const report of items) {
    const raw = report.coach_club ?? "";
    if (!raw.trim()) continue;
    const tokens = raw
      .split(/[\n,;/]+/g)
      .map((token) => token.trim())
      .filter(Boolean);
    for (const token of tokens) {
      const key = normalizeClubToken(token);
      if (!key) continue;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        // Keep the first-seen display casing.
        counts.set(key, { count: 1, display: token.trim() });
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => (b.count - a.count) || a.display.localeCompare(b.display))
    .slice(0, top)
    .map((entry) => entry.display);
};

export const extractPrioritySnippet = (report: ReportContentLike | null | undefined) => {
  if (!report) return null;
  const coachWork = report.coach_work?.trim() ?? "";
  const coachObs = report.coach_observations?.trim() ?? "";
  const raw = coachWork.length > 0 ? coachWork : coachObs;
  if (!raw) return null;
  const firstLine = raw.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > 90 ? `${collapsed.slice(0, 87)}...` : collapsed;
};
