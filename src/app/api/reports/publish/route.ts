import { createHash } from "node:crypto";
import { z } from "zod";
import OpenAI from "openai";
import { env } from "@/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { loadPromptSection } from "@/lib/promptLoader";
import { generateReportKpisForPublishedReport } from "@/lib/ai/report-kpis";
import { computeAiCostEurCents } from "@/lib/ai/pricing";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const publishSchema = z.object({
  reportId: z.string().min(1),
});

type ReportSection = {
  id: string;
  title: string;
  type: string | null;
  content: string | null;
  content_formatted: string | null;
  content_format_hash: string | null;
};

const extractOutputText = (response: {
  output_text?: string | null;
  output?: Array<unknown>;
}) => {
  const direct = response.output_text?.trim();
  if (direct) return direct;

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (!item || typeof item !== "object") continue;
    if ("content" in item) {
      const content = (item as { content?: unknown }).content;
      if (typeof content === "string") {
        parts.push(content);
      } else if (Array.isArray(content)) {
        for (const chunk of content) {
          if (typeof chunk === "string") {
            parts.push(chunk);
          } else if (chunk && typeof chunk === "object" && "type" in chunk) {
            const typed = chunk as { type: string; text?: string; refusal?: string };
            if (typed.type === "output_text" && typed.text) {
              parts.push(typed.text);
            } else if (typed.type === "text" && typed.text) {
              parts.push(typed.text);
            } else if (typed.type === "refusal" && typed.refusal) {
              parts.push(`Refus: ${typed.refusal}`);
            }
          }
        }
      }
    }
  }

  return parts.join("\n").trim();
};

const hashContent = (value: string) =>
  createHash("sha256").update(value.trim()).digest("hex");

const loadSystemPrompt = async () => {
  const prompt = await loadPromptSection("report_format_system");
  return prompt.trim();
};

const buildUserPrompt = (title: string, content: string) =>
  `
Section: ${title}
Contenu a reformater:
${content}`.trim();

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, publishSchema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(req);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();

  const { reportId } = parsed.data;

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, student_id, sent_at")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    await recordActivity({
      admin,
      level: "warn",
      action: "report.publish.not_found",
      actorUserId: userId,
      entityType: "report",
      entityId: reportId,
      message: "Tentative de publication d un rapport introuvable.",
    });
    return Response.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData?.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "report.publish.denied",
      actorUserId: userId,
      entityType: "report",
      entityId: report.id,
      message: "Organisation active introuvable pour la publication.",
    });
    return Response.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", profileData.org_id)
    .single();

  if (workspaceError || !workspace) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.publish.workspace_missing",
      actorUserId: userId,
      orgId: profileData.org_id,
      entityType: "report",
      entityId: report.id,
      message: "Workspace introuvable au moment de publier un rapport.",
      metadata: {
        workspaceError: workspaceError?.message ?? null,
      },
    });
    return Response.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  if (workspace.workspace_type === "personal") {
    if (workspace.owner_profile_id !== userId) {
      await recordActivity({
        admin,
        level: "warn",
        action: "report.publish.denied",
        actorUserId: userId,
        orgId: profileData.org_id,
        entityType: "report",
        entityId: report.id,
        message: "Publication refusee hors proprietaire du workspace personnel.",
      });
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }
  } else {
    const { data: membership } = await admin
      .from("org_memberships")
      .select("role, status")
      .eq("org_id", profileData.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || membership.status !== "active") {
      await recordActivity({
        admin,
        level: "warn",
        action: "report.publish.denied",
        actorUserId: userId,
        orgId: profileData.org_id,
        entityType: "report",
        entityId: report.id,
        message: "Publication refusee: membre inactif ou absent.",
      });
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }

    const planTier = await loadPersonalPlanTier(admin, userId);
    if (planTier === "free") {
      await recordActivity({
        admin,
        level: "warn",
        action: "report.publish.denied",
        actorUserId: userId,
        orgId: profileData.org_id,
        entityType: "report",
        entityId: report.id,
        message: "Publication refusee: plan Free en organisation.",
      });
      return Response.json(
        { error: "Lecture seule: plan Free en organisation." },
        { status: 403 }
      );
    }

    const { data: assignments } = await admin
      .from("student_assignments")
      .select("coach_id")
      .eq("student_id", report.student_id);

    const assignedIds = (assignments ?? []).map(
      (row) => (row as { coach_id: string }).coach_id
    );
    const isAssigned = assignedIds.includes(userId);
    if (membership.role !== "admin" && !isAssigned) {
      await recordActivity({
        admin,
        level: "warn",
        action: "report.publish.denied",
        actorUserId: userId,
        orgId: profileData.org_id,
        entityType: "report",
        entityId: report.id,
        message: "Publication refusee: coach non assigne a l eleve.",
      });
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }
  }

  const { data: studentData } = await supabase
    .from("students")
    .select("org_id")
    .eq("id", report.student_id)
    .single();

  if (!studentData || String(studentData.org_id) !== String(profileData.org_id)) {
    await recordActivity({
      admin,
      level: "warn",
      action: "report.publish.denied",
      actorUserId: userId,
      orgId: profileData.org_id,
      entityType: "report",
      entityId: report.id,
      message: "Publication refusee: eleve hors workspace actif.",
    });
    return Response.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: sectionsData, error: sectionsError } = await admin
    .from("report_sections")
    .select("id, title, type, content, content_formatted, content_format_hash")
    .eq("report_id", reportId)
    .order("position", { ascending: true });

  if (sectionsError) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.publish.sections_error",
      actorUserId: userId,
      orgId: profileData.org_id,
      entityType: "report",
      entityId: report.id,
      message: sectionsError.message ?? "Erreur de lecture des sections.",
    });
    return Response.json(
      { error: sectionsError.message ?? "Erreur de lecture des sections." },
      { status: 500 }
    );
  }

  const sections = (sectionsData ?? []) as ReportSection[];
  const toFormat = sections
    .filter((section) => section.type === "text" || !section.type)
    .map((section) => ({
      ...section,
      content: section.content ?? "",
    }))
    .filter((section) => section.content.trim().length > 0)
    .filter((section) => {
      const nextHash = hashContent(section.content);
      const hasFormatted = Boolean(section.content_formatted?.trim());
      return !hasFormatted || section.content_format_hash !== nextHash;
    });

  let formattedCount = 0;
  if (toFormat.length > 0) {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const systemPrompt = await loadSystemPrompt();
    if (!systemPrompt) {
      await recordActivity({
        admin,
        level: "error",
        action: "report.publish.format_prompt_missing",
        actorUserId: userId,
        orgId: profileData.org_id,
        entityType: "report",
        entityId: report.id,
        message: "Prompt de reformatage introuvable.",
      });
      return Response.json(
        { error: "Prompt de reformatage introuvable." },
        { status: 500 }
      );
    }
    const endpoint = "report_publish";
    const action = "report_publish_format";
    const model = "gpt-5.2";
    const recordUsage = async (
      usage:
        | {
            input_tokens?: number;
            output_tokens?: number;
            total_tokens?: number;
          }
        | null
        | undefined,
      startedAtMs: number,
      statusCode: number,
      errorType?: "timeout" | "exception"
    ) => {
      const shouldRecord = Boolean(usage) || statusCode >= 400;
      if (!shouldRecord) return;
      const inputTokens =
        typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
      const outputTokens =
        typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;
      const totalTokens =
        typeof usage?.total_tokens === "number"
          ? usage.total_tokens
          : inputTokens + outputTokens;
      const costEurCents = computeAiCostEurCents(inputTokens, outputTokens, model);
      try {
        await admin.from("ai_usage").insert([
          {
            user_id: userId,
            org_id: profileData.org_id,
            action,
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            cost_eur_cents: costEurCents,
            duration_ms: Date.now() - startedAtMs,
            endpoint,
            status_code: statusCode,
            error_type: errorType ?? null,
          },
        ]);
      } catch (error) {
        console.error("report.publish usage logging failed:", error);
      }
    };
    const updates: Array<{
      id: string;
      content_formatted: string;
      content_format_hash: string;
    }> = [];

    for (const section of toFormat) {
      const sectionStartedAt = Date.now();
      let response:
        | {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              total_tokens?: number;
            } | null;
            output_text?: string | null;
            output?: Array<unknown>;
          }
        | null = null;
      try {
        response = await openai.responses.create({
          model,
          temperature: 0.2,
          max_output_tokens: 900,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemPrompt }],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildUserPrompt(section.title, section.content),
                },
              ],
            },
          ],
        });
      } catch (error) {
        await recordUsage(null, sectionStartedAt, 502, "exception");
        await recordActivity({
          admin,
          level: "error",
          action: "report.publish.format_failed",
          actorUserId: userId,
          orgId: profileData.org_id,
          entityType: "report",
          entityId: report.id,
          message: "Echec de reformattage d une section.",
          metadata: {
            sectionId: section.id,
            sectionTitle: section.title,
            reason: error instanceof Error ? error.message : "openai_error",
          },
        });
        return Response.json(
          { error: "Echec de reformattage du rapport." },
          { status: 502 }
        );
      }

      const formatted = extractOutputText(response);
      if (!formatted) {
        await recordUsage(response.usage ?? null, sectionStartedAt, 502, "exception");
        await recordActivity({
          admin,
          level: "error",
          action: "report.publish.format_failed",
          actorUserId: userId,
          orgId: profileData.org_id,
          entityType: "report",
          entityId: report.id,
          message: "Echec de reformattage d une section.",
          metadata: {
            sectionId: section.id,
            sectionTitle: section.title,
          },
        });
        return Response.json(
          { error: "Echec de reformattage du rapport." },
          { status: 502 }
        );
      }
      await recordUsage(response.usage ?? null, sectionStartedAt, 200);

      updates.push({
        id: section.id,
        content_formatted: formatted,
        content_format_hash: hashContent(section.content),
      });
    }

    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await admin
          .from("report_sections")
          .update({
            content_formatted: update.content_formatted,
            content_format_hash: update.content_format_hash,
          })
          .eq("id", update.id)
          .eq("org_id", profileData.org_id);
        if (updateError) {
          await recordActivity({
            admin,
            level: "error",
            action: "report.publish.section_update_failed",
            actorUserId: userId,
            orgId: profileData.org_id,
            entityType: "report",
            entityId: report.id,
            message: updateError.message ?? "Erreur de sauvegarde section.",
            metadata: {
              sectionId: update.id,
            },
          });
          return Response.json(
            { error: updateError.message ?? "Erreur de sauvegarde." },
            { status: 500 }
          );
        }
      }
      formattedCount = updates.length;
    }
  }

  const sentAt = report.sent_at ?? new Date().toISOString();
  const { error: publishError } = await admin
    .from("reports")
    .update({ sent_at: sentAt })
    .eq("id", report.id);

  if (publishError) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.publish.failed",
      actorUserId: userId,
      orgId: profileData.org_id,
      entityType: "report",
      entityId: report.id,
      message: publishError.message ?? "Erreur de publication.",
    });
    return Response.json(
      { error: publishError.message ?? "Erreur de publication." },
      { status: 500 }
    );
  }

  let kpiStatus: "pending" | "ready" | "error" = "pending";
  try {
    const result = await generateReportKpisForPublishedReport({
      admin,
      orgId: profileData.org_id,
      studentId: report.student_id,
      reportId: report.id,
      actorUserId: userId,
      timeoutMs: 12_000,
    });
    kpiStatus = result.status;
  } catch (error) {
    console.error("[report_kpis] generation failed:", error);
    kpiStatus = "error";
  }

  await recordActivity({
    admin,
    action: "report.publish.success",
    actorUserId: userId,
    orgId: profileData.org_id,
    entityType: "report",
    entityId: report.id,
    message: "Rapport publie.",
    metadata: {
      formattedSections: formattedCount,
      kpiStatus,
    },
  });

  return Response.json({ sentAt, formattedSections: formattedCount, kpis: { status: kpiStatus } });
}
