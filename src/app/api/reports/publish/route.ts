import { createHash } from "node:crypto";
import { z } from "zod";
import OpenAI from "openai";
import { env } from "@/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPromptSection } from "@/lib/promptLoader";

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

  const { reportId } = parsed.data;

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, student_id, sent_at")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    return Response.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData?.org_id) {
    return Response.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: studentData } = await supabase
    .from("students")
    .select("org_id")
    .eq("id", report.student_id)
    .single();

  if (!studentData || String(studentData.org_id) !== String(profileData.org_id)) {
    return Response.json({ error: "Acces refuse." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: sectionsData, error: sectionsError } = await admin
    .from("report_sections")
    .select("id, title, type, content, content_formatted, content_format_hash")
    .eq("report_id", reportId)
    .order("position", { ascending: true });

  if (sectionsError) {
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
      return Response.json(
        { error: "Prompt de reformatage introuvable." },
        { status: 500 }
      );
    }
    const updates: Array<{
      id: string;
      content_formatted: string;
      content_format_hash: string;
    }> = [];

    for (const section of toFormat) {
      const response = await openai.responses.create({
        model: "gpt-5.2",
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

      const formatted = extractOutputText(response);
      if (!formatted) {
        return Response.json(
          { error: "Echec de reformattage du rapport." },
          { status: 502 }
        );
      }

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
    return Response.json(
      { error: publishError.message ?? "Erreur de publication." },
      { status: 500 }
    );
  }

  return Response.json({ sentAt, formattedSections: formattedCount });
}
