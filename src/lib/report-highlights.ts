import { z } from "zod";

const TimestampSchema = z.string().min(1);

export const ReportSectionKpiSchema = z.object({
  id: z.string().uuid(),
  report_id: z.string().uuid(),
  title: z.string().min(1),
  content: z.string().nullable().optional(),
  content_formatted: z.string().nullable().optional(),
  position: z.number().int().optional(),
  created_at: TimestampSchema.optional(),
});

export type ReportSectionKpi = z.infer<typeof ReportSectionKpiSchema>;

export type HighlightKey = "strength" | "weakness" | "physical" | "technical";

export type ReportHighlights = Record<HighlightKey, string | null>;

export type LongTermHighlights = Record<
  HighlightKey,
  { snippet: string | null; mentions: number }
>;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const extractSnippet = (raw: string) => {
  const firstLine =
    raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > 110 ? `${collapsed.slice(0, 107)}...` : collapsed;
};

const sectionText = (section: ReportSectionKpi) =>
  (section.content_formatted ?? section.content ?? "").trim();

const classifySection = (title: string): HighlightKey[] => {
  const t = normalize(title);
  const keys: HighlightKey[] = [];

  // Strength
  if (t.includes("point fort") || t.includes("points forts") || t.includes("forces")) {
    keys.push("strength");
  }

  // Weakness
  if (
    t.includes("point faible") ||
    t.includes("points faibles") ||
    t.includes("faibless") ||
    t.includes("axes d") ||
    t.includes("a ameliorer") ||
    t.includes("a travailler")
  ) {
    keys.push("weakness");
  }

  // Physical
  if (t.includes("physique") || t.includes("mobilite") || t.includes("tpi")) {
    keys.push("physical");
  }

  // Technical
  if (t.includes("technique") || t.includes("swing") || t.includes("mecanique")) {
    keys.push("technical");
  }

  return keys;
};

export const buildReportHighlights = (sections: ReportSectionKpi[]): ReportHighlights => {
  const out: ReportHighlights = {
    strength: null,
    weakness: null,
    physical: null,
    technical: null,
  };

  // Stable: keep report order, then section order.
  for (const section of sections) {
    const keys = classifySection(section.title);
    if (keys.length === 0) continue;
    const snippet = extractSnippet(sectionText(section));
    if (!snippet) continue;
    for (const key of keys) {
      if (out[key]) continue;
      out[key] = snippet;
    }
  }

  return out;
};

export const buildLongTermHighlights = (
  reportIdsNewestFirst: string[],
  sections: ReportSectionKpi[]
): LongTermHighlights => {
  const byReport = new Map<string, ReportSectionKpi[]>();
  for (const section of sections) {
    const list = byReport.get(section.report_id);
    if (list) list.push(section);
    else byReport.set(section.report_id, [section]);
  }

  const mentions: Record<HighlightKey, number> = {
    strength: 0,
    weakness: 0,
    physical: 0,
    technical: 0,
  };

  for (const reportId of reportIdsNewestFirst) {
    const reportSections = byReport.get(reportId) ?? [];
    const h = buildReportHighlights(reportSections);
    (Object.keys(mentions) as HighlightKey[]).forEach((key) => {
      if (h[key]) mentions[key] += 1;
    });
  }

  const pickMostRecent = (key: HighlightKey) => {
    for (const reportId of reportIdsNewestFirst) {
      const reportSections = byReport.get(reportId) ?? [];
      const h = buildReportHighlights(reportSections);
      if (h[key]) return h[key];
    }
    return null;
  };

  return {
    strength: { snippet: pickMostRecent("strength"), mentions: mentions.strength },
    weakness: { snippet: pickMostRecent("weakness"), mentions: mentions.weakness },
    physical: { snippet: pickMostRecent("physical"), mentions: mentions.physical },
    technical: { snippet: pickMostRecent("technical"), mentions: mentions.technical },
  };
};
