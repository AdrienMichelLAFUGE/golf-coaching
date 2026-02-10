import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/env";
import { loadPromptSection, applyTemplate } from "@/lib/promptLoader";
import {
  ReportKpisPayloadSchema,
  type ReportKpisPayload,
  type ReportKpisStatus,
} from "@/lib/report-kpis-ai";

type AdminClient = ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
};

type SectionRow = {
  id: string;
  report_id: string;
  title: string;
  content: string | null;
  content_formatted: string | null;
  content_format_hash: string | null;
  position: number | null;
};

type OrgAiSettings = {
  ai_model: string | null;
};

const toIsoDate = (value: string | null, fallback: string) => {
  const raw = value ?? fallback;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return new Date(fallback).toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const truncate = (value: string, maxChars: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
};

const extractJsonText = (raw: string) =>
  raw.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();

const parseJsonPayload = (raw: string) => {
  const cleaned = extractJsonText(raw);
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    }
    throw new Error("Invalid JSON payload");
  }
};

const buildTextSchema = () => ({
  format: {
    type: "json_schema" as const,
    name: "report_kpis",
    description:
      "Retourne un objet JSON avec 3 KPI short_term et 3 KPI long_term, plus meta.sampleSize.",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        short_term: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              value: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              evidence: { type: "string" },
            },
            required: ["id", "title", "value", "confidence", "evidence"],
          },
        },
        long_term: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              value: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              evidence: { type: "string" },
            },
            required: ["id", "title", "value", "confidence", "evidence"],
          },
        },
        meta: {
          type: "object",
          additionalProperties: false,
          properties: {
            sampleSize: { type: "number", minimum: 1, maximum: 5 },
          },
          required: ["sampleSize"],
        },
      },
      required: ["short_term", "long_term", "meta"],
    },
    strict: true,
  },
});

const hashDigest = (value: string) => createHash("sha256").update(value).digest("hex");

const buildInputHash = (reports: ReportRow[], sections: SectionRow[]) => {
  const parts: string[] = [];
  parts.push("reports:");
  for (const report of reports) {
    parts.push(report.id);
  }
  parts.push("sections:");
  // Stable order: report_id then position then id.
  const stable = [...sections].sort((a, b) => {
    const r = a.report_id.localeCompare(b.report_id);
    if (r !== 0) return r;
    const pa = a.position ?? 0;
    const pb = b.position ?? 0;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
  for (const section of stable) {
    const contentKey =
      section.content_format_hash ??
      hashDigest((section.content_formatted ?? section.content ?? "").trim());
    parts.push(`${section.report_id}:${section.id}:${contentKey}`);
  }
  return hashDigest(parts.join("|"));
};

const buildReportsDigest = (reportsNewestFirst: ReportRow[], sections: SectionRow[]) => {
  const byReport = new Map<string, SectionRow[]>();
  for (const section of sections) {
    const list = byReport.get(section.report_id);
    if (list) list.push(section);
    else byReport.set(section.report_id, [section]);
  }

  const lines: string[] = [];
  reportsNewestFirst.forEach((report, idx) => {
    const date = toIsoDate(report.report_date, report.created_at);
    const isLatest = idx === 0;
    const maxSectionChars = isLatest ? 420 : 240;
    const maxReportChars = isLatest ? 2400 : 1200;

    lines.push(
      `### Rapport ${idx + 1}${isLatest ? " (dernier)" : ""} - ${date} - ${truncate(
        report.title || "Rapport",
        80
      )}`
    );

    const reportSections = (byReport.get(report.id) ?? []).sort((a, b) => {
      const pa = a.position ?? 0;
      const pb = b.position ?? 0;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });

    for (const section of reportSections) {
      const raw = (section.content_formatted ?? section.content ?? "").trim();
      if (!raw) continue;
      const snippet = truncate(raw.replace(/\s+/g, " "), maxSectionChars);
      lines.push(`- ${truncate(section.title, 44)}: ${snippet}`);
    }

    // Cap per-report block.
    // Cheap cap: join last report block and truncate if too long.
    // (We keep global overall size reasonable; sections were already truncated.)
    const block = lines
      .slice(lines.length - Math.max(1, reportSections.length + 1))
      .join("\n");
    if (block.length > maxReportChars) {
      const reduced = truncate(block, maxReportChars);
      // Replace block lines with reduced single block.
      lines.splice(lines.length - Math.max(1, reportSections.length + 1));
      lines.push(reduced);
    }

    lines.push("");
  });

  return lines.join("\n").trim();
};

const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const ReportKpisRowInsertSchema = z.object({
  org_id: z.string().uuid(),
  student_id: z.string().uuid(),
  report_id: z.string().uuid(),
  status: z.enum(["pending", "ready", "error"]),
  input_hash: z.string().min(1),
  prompt_version: z.string().min(1),
  model: z.string().nullable().optional(),
  kpis_short: z.array(z.unknown()),
  kpis_long: z.array(z.unknown()),
  error: z.string().nullable().optional(),
});

export const generateReportKpisForPublishedReport = async (params: {
  admin: AdminClient;
  orgId: string;
  studentId: string;
  reportId: string;
  actorUserId: string;
  timeoutMs?: number;
}) => {
  const { admin, orgId, studentId, reportId, actorUserId } = params;
  const timeoutMs = params.timeoutMs ?? 12_000;
  const startedAt = Date.now();
  const endpoint = "report_kpis";

  const recordUsage = async (
    usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null,
    statusCode: number,
    errorType?: "timeout" | "exception",
    model?: string | null
  ) => {
    const shouldRecord = Boolean(usage) || statusCode >= 400;
    if (!shouldRecord) return;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;

    await admin.from("ai_usage").insert([
      {
        user_id: actorUserId,
        org_id: orgId,
        action: endpoint,
        model: model ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        duration_ms: Date.now() - startedAt,
        endpoint,
        status_code: statusCode,
        error_type: errorType ?? null,
      },
    ]);
  };

  const fail = async (message: string, errorType: "timeout" | "exception") => {
    await admin
      .from("report_kpis")
      .upsert(
        [
          {
            org_id: orgId,
            student_id: studentId,
            report_id: reportId,
            status: "error",
            input_hash: hashDigest(`${orgId}:${studentId}:${reportId}:${Date.now()}`),
            prompt_version: "v1",
            kpis_short: [],
            kpis_long: [],
            error: message,
          },
        ],
        { onConflict: "report_id" }
      );
    await recordUsage(null, 502, errorType);
    return { status: "error" as const, error: message };
  };

  const orgParsed = z
    .object({ ai_model: z.string().nullable().optional() })
    .safeParse(
      (
        await admin
          .from("organizations")
          .select("ai_model")
          .eq("id", orgId)
          .single()
      ).data ?? null
    );
  const orgAi: OrgAiSettings = { ai_model: orgParsed.success ? orgParsed.data.ai_model ?? null : null };
  const model = orgAi.ai_model ?? "gpt-5-mini";

  const { data: targetReport, error: targetError } = await admin
    .from("reports")
    .select("id, title, report_date, created_at, sent_at")
    .eq("id", reportId)
    .single();

  if (targetError || !targetReport) {
    return fail(targetError?.message ?? "Rapport introuvable.", "exception");
  }
  if (!targetReport.sent_at) {
    return fail("Rapport non publie.", "exception");
  }

  const { data: otherReportsData, error: reportsError } = await admin
    .from("reports")
    .select("id, title, report_date, created_at, sent_at")
    .eq("student_id", studentId)
    .not("sent_at", "is", null)
    .neq("id", reportId)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(4);

  if (reportsError) {
    return fail(reportsError.message ?? "Erreur de lecture des rapports.", "exception");
  }

  const reports = [targetReport as ReportRow, ...((otherReportsData ?? []) as ReportRow[])];
  const reportIds = reports.map((r) => r.id);
  const sampleSize = reportIds.length;
  if (sampleSize === 0) {
    return fail("Aucun rapport publie pour generer des KPI.", "exception");
  }

  // Ensure target report exists in sample (it should be the latest published).
  const { data: sectionsData, error: sectionsError } = await admin
    .from("report_sections")
    .select(
      "id, report_id, title, content, content_formatted, content_format_hash, position"
    )
    .in("report_id", reportIds)
    .order("position", { ascending: true });

  if (sectionsError) {
    return fail(sectionsError.message ?? "Erreur de lecture des sections.", "exception");
  }

  const sections = (sectionsData ?? []) as SectionRow[];
  const inputHash = buildInputHash(reports, sections);

  // Cache: if KPI already exists for this report and the input hash matches, avoid re-calling OpenAI.
  const { data: existingRow, error: existingError } = await admin
    .from("report_kpis")
    .select("status, input_hash")
    .eq("report_id", reportId)
    .maybeSingle();

  if (!existingError && existingRow) {
    const statusParsed = z
      .object({ status: z.string(), input_hash: z.string() })
      .safeParse(existingRow);
    if (statusParsed.success) {
      const status = statusParsed.data.status;
      if (status === "ready" && statusParsed.data.input_hash === inputHash) {
        return { status: "ready" as const, cached: true as const };
      }
    }
  }

  const pendingPayload = ReportKpisRowInsertSchema.parse({
    org_id: orgId,
    student_id: studentId,
    report_id: reportId,
    status: "pending",
    input_hash: inputHash,
    prompt_version: "v1",
    model,
    kpis_short: [],
    kpis_long: [],
    error: null,
  });

  const { error: pendingError } = await admin
    .from("report_kpis")
    .upsert([pendingPayload], { onConflict: "report_id" });
  if (pendingError) {
    return fail(pendingError.message ?? "Erreur de sauvegarde KPI.", "exception");
  }

  const systemPrompt = (await loadPromptSection("report_kpis_system")).trim();
  const userTemplate = (await loadPromptSection("report_kpis_user")).trim();
  if (!systemPrompt || !userTemplate) {
    return fail("Prompt KPI introuvable.", "exception");
  }

  const reportsDigest = buildReportsDigest(reports, sections);
  const userPrompt = applyTemplate(userTemplate, { reportsDigest });

  try {
    if (!env.OPENAI_API_KEY) {
      await admin
        .from("report_kpis")
        .upsert(
          [
            {
              org_id: orgId,
              student_id: studentId,
              report_id: reportId,
              status: "error",
              input_hash: inputHash,
              prompt_version: "v1",
              model,
              kpis_short: [],
              kpis_long: [],
              error: "OPENAI_API_KEY manquante.",
            },
          ],
          { onConflict: "report_id" }
        );
      await recordUsage(null, 500, "exception", model);
      return { status: "error" as const, error: "OPENAI_API_KEY manquante." };
    }

    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await withTimeout(
      openai.responses.create({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        max_output_tokens: 900,
        text: buildTextSchema(),
      }),
      timeoutMs
    );

    const usage = (response as { usage?: unknown }).usage as
      | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
      | undefined;
    const rawText = (response as { output_text?: string | null }).output_text ?? "";
    const parsed = ReportKpisPayloadSchema.safeParse(parseJsonPayload(rawText));
    if (!parsed.success) {
      await admin
        .from("report_kpis")
        .upsert(
          [
            {
              org_id: orgId,
              student_id: studentId,
              report_id: reportId,
              status: "error",
              input_hash: inputHash,
              prompt_version: "v1",
              model,
              kpis_short: [],
              kpis_long: [],
              error: "KPI JSON invalide.",
            },
          ],
          { onConflict: "report_id" }
        );
      // Even if upsert fails, publish must not be blocked; we still record usage.
      await recordUsage(usage ?? null, 502, "exception", model);
      return { status: "error" as const, error: "KPI JSON invalide." };
    }

    const payload: ReportKpisPayload = {
      short_term: parsed.data.short_term,
      long_term: parsed.data.long_term,
      meta: { sampleSize },
    };

    await admin
      .from("report_kpis")
      .upsert(
        [
          {
            org_id: orgId,
            student_id: studentId,
            report_id: reportId,
            status: "ready",
            input_hash: inputHash,
            prompt_version: "v1",
            model,
            kpis_short: payload.short_term,
            kpis_long: payload.long_term,
            error: null,
          },
        ],
        { onConflict: "report_id" }
      );

    await recordUsage(usage ?? null, 200, undefined, model);
    return { status: "ready" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur KPI IA.";
    const errorType = message.toLowerCase().includes("timeout") ? "timeout" : "exception";

    await admin
      .from("report_kpis")
      .upsert(
        [
          {
            org_id: orgId,
            student_id: studentId,
            report_id: reportId,
            status: "error",
            input_hash: inputHash,
            prompt_version: "v1",
            model,
            kpis_short: [],
            kpis_long: [],
            error: message,
          },
        ],
        { onConflict: "report_id" }
      );

    await recordUsage(null, 502, errorType, model);
    return { status: "error" as const, error: message };
  }
};

export const normalizeKpiStatus = (status: ReportKpisStatus | null | undefined) =>
  status ?? ("error" as const);
