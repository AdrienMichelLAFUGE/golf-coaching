import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyTemplate, loadPromptSection } from "@/lib/promptLoader";

export const runtime = "nodejs";

type AiAction =
  | "improve"
  | "write"
  | "summary"
  | "propagate"
  | "plan"
  | "clarify"
  | "axes";

type AiSection = {
  title: string;
  content: string;
};

type AiSettings = {
  tone: string;
  techLevel: string;
  style: string;
  length: string;
  imagery: string;
  focus: string;
};

type AiPayload = {
  action: AiAction;
  sectionTitle?: string;
  sectionContent?: string;
  allSections?: AiSection[];
  targetSections?: string[];
  propagateMode?: "empty" | "append";
  tpiContext?: string;
  clarifications?: { question: string; answer: string }[];
  axesSelections?: { section: string; title: string; summary: string }[];
  settings?: Partial<AiSettings>;
};

const buildContext = (sections: AiSection[] = []) =>
  sections
    .map(
      (section, index) =>
        `${index + 1}. ${section.title}\n${section.content}`.trim()
    )
    .join("\n\n");

const resolveSettings = (
  org: {
    ai_tone: string | null;
    ai_tech_level: string | null;
    ai_style: string | null;
    ai_length: string | null;
    ai_imagery: string | null;
    ai_focus: string | null;
  },
  overrides?: Partial<AiSettings>
): AiSettings => ({
  tone: overrides?.tone ?? org.ai_tone ?? "bienveillant",
  techLevel: overrides?.techLevel ?? org.ai_tech_level ?? "intermediaire",
  style: overrides?.style ?? org.ai_style ?? "redactionnel",
  length: overrides?.length ?? org.ai_length ?? "normal",
  imagery: overrides?.imagery ?? org.ai_imagery ?? "equilibre",
  focus: overrides?.focus ?? org.ai_focus ?? "mix",
});

const inferPlanHorizon = (title?: string) => {
  const text = (title ?? "").toLowerCase();
  const match = text.match(
    /(\d+)\s*(jour|jours|semaine|semaines|mois|an|ans|annee|annees)/
  );
  if (match) {
    const count = match[1];
    const unit = match[2]
      .replace("annees", "ans")
      .replace("annee", "an");
    return `${count} ${unit}`;
  }
  if (text.includes("trimestre")) return "3 mois";
  if (text.includes("saison")) return "3 mois";
  if (text.includes("mois")) return "1 mois";
  if (text.includes("semaine")) return "1 semaine";
  if (text.includes("jour")) return "7 jours";
  return "1 semaine";
};

const buildSystemPrompt = async (
  action: AiAction,
  settings: AiSettings,
  sectionTitle?: string,
  propagateMode?: "empty" | "append"
) => {
  const styleHint =
    settings.style === "structure"
      ? await loadPromptSection("ai_hint_style_structure")
      : await loadPromptSection("ai_hint_style_redactionnel");

  const lengthHint =
    settings.length === "court"
      ? await loadPromptSection("ai_hint_length_court")
      : settings.length === "long"
      ? await loadPromptSection("ai_hint_length_long")
      : await loadPromptSection("ai_hint_length_normal");

  const imageryHint =
    settings.imagery === "faible"
      ? await loadPromptSection("ai_hint_imagery_faible")
      : settings.imagery === "fort"
      ? await loadPromptSection("ai_hint_imagery_fort")
      : await loadPromptSection("ai_hint_imagery_equilibre");

  const focusHint =
    settings.focus === "technique"
      ? await loadPromptSection("ai_hint_focus_technique")
      : settings.focus === "mental"
      ? await loadPromptSection("ai_hint_focus_mental")
      : settings.focus === "strategie"
      ? await loadPromptSection("ai_hint_focus_strategie")
      : await loadPromptSection("ai_hint_focus_mix");

  const baseTemplate = await loadPromptSection("ai_api_system_base");
  const base = applyTemplate(baseTemplate, {
    tone: settings.tone,
    techLevel: settings.techLevel,
    imageryHint,
    focusHint,
  });

  if (action === "improve") {
    const template = await loadPromptSection("ai_api_improve");
    return applyTemplate(template, { base });
  }

  if (action === "write") {
    const template = await loadPromptSection("ai_api_write");
    return applyTemplate(template, {
      base,
      styleHint,
      lengthHint,
      sectionTitle: sectionTitle ?? "Section",
    });
  }

  if (action === "propagate") {
    const template = await loadPromptSection("ai_api_propagate");
    const modeHint =
      propagateMode === "append"
        ? "Ajoute un nouveau paragraphe complementaire sans repeter ce qui existe deja. Commence le paragraphe par un connecteur (ensuite, puis, par la suite) pour garder un enchainement naturel."
        : "Ecris un contenu initial si la section est vide.";
    return applyTemplate(template, {
      base,
      styleHint,
      modeHint,
    });
  }

  if (action === "clarify") {
    const template = await loadPromptSection("ai_api_clarify");
    return applyTemplate(template, { base });
  }

  if (action === "axes") {
    const template = await loadPromptSection("ai_api_axes");
    return applyTemplate(template, {
      base,
      styleHint,
    });
  }

  if (action === "summary") {
    const template = await loadPromptSection("ai_api_summary");
    return applyTemplate(template, {
      base,
      lengthHint,
    });
  }

  if (action === "plan") {
    const template = await loadPromptSection("ai_api_plan");
    const horizon = inferPlanHorizon(sectionTitle);
    const planTitle = sectionTitle ?? "Plan";
    return applyTemplate(template, {
      base,
      styleHint,
      sectionTitle: planTitle,
      horizon,
    });
  }

  return `${base} ${lengthHint} Resume le rapport en 4 a 6 points essentiels.`;
};

const maxTokensForLength = (length: string) => {
  if (length === "court") return 250;
  if (length === "long") return 900;
  return 500;
};

const stripLeadingTitle = (text: string, title?: string) => {
  if (!title) return text;
  const lines = text.split("\n");
  if (lines.length === 0) return text;
  const normalizedTitle = title.trim().toLowerCase();
  const firstLine = lines[0]
    .trim()
    .replace(/^[-*#]+\s*/, "")
    .replace(/[:\-–—]\s*$/, "")
    .toLowerCase();

  if (firstLine === normalizedTitle) {
    return lines.slice(1).join("\n").trim();
  }

  return text;
};

const normalizeJsonText = (raw: string) => {
  let text = raw.replace(/\r\n/g, "\n");
  text = text.replace(/,(\s*[}\]])/g, "$1");

  let output = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"' && !escaped) {
      inString = !inString;
      output += char;
      escaped = false;
      continue;
    }

    if (inString && char === "\n") {
      output += "\\n";
      escaped = false;
      continue;
    }

    if (inString && char === "\t") {
      output += "\\t";
      escaped = false;
      continue;
    }

    if (char === "\\" && !escaped) {
      escaped = true;
      output += char;
      continue;
    }

    escaped = false;
    output += char;
  }

  return output.trim();
};

const parseJsonPayload = (raw: string) => {
  const cleaned = raw
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  const normalized = normalizeJsonText(cleaned);
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }
    throw new Error("Invalid JSON payload");
  }
};

const extractSuggestions = (response: {
  output?: Array<{
    type?: string;
    name?: string;
    arguments?: string;
  }>;
  output_text?: string;
}): Array<{ title: string; content: string }> | null => {
  const toolCall = response.output?.find(
    (item) => item.type === "function_call" && item.name === "propagate_sections"
  );

  try {
    if (toolCall?.arguments) {
      const parsed = parseJsonPayload(toolCall.arguments) as {
        suggestions?: Array<{ title: string; content: string }>;
      };
      return parsed?.suggestions ?? null;
    }

    if (response.output_text) {
      const parsed = parseJsonPayload(response.output_text) as {
        suggestions?: Array<{ title: string; content: string }>;
      };
      return parsed?.suggestions ?? null;
    }
  } catch (error) {
    console.error("Suggestion parse error:", error, {
      argumentsSnippet: toolCall?.arguments?.slice(0, 800),
      outputSnippet: response.output_text?.slice(0, 800),
    });
  }

  return null;
};

const extractClarify = (response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: unknown;
  }>;
}):
  | {
      confidence: number;
      questions: Array<{
        id: string;
        question: string;
        type: "text" | "choices";
        choices?: string[];
        multi?: boolean;
        required?: boolean;
        placeholder?: string;
      }>;
    }
  | null => {
  const raw = response.output_text?.trim();
  if (!raw && response.output) {
    const parts: string[] = [];
    response.output.forEach((item) => {
      const content = item.content;
      if (typeof content === "string") {
        parts.push(content);
      } else if (Array.isArray(content)) {
        content.forEach((chunk) => {
          if (typeof chunk === "string") {
            parts.push(chunk);
          } else if (
            chunk &&
            typeof chunk === "object" &&
            "text" in chunk
          ) {
            const typed = chunk as { text?: string };
            if (typed.text) parts.push(typed.text);
          }
        });
      }
    });
    if (parts.length > 0) {
      try {
        return parseJsonPayload(parts.join("\n").trim()) as {
          confidence: number;
          questions: Array<{
            id: string;
            question: string;
            type: "text" | "choices";
            choices?: string[];
            multi?: boolean;
            required?: boolean;
            placeholder?: string;
          }>;
        };
      } catch (error) {
        console.error("Clarify parse error:", error, {
          outputSnippet: parts.join("\n").slice(0, 800),
        });
        return null;
      }
    }
  }

  if (!raw) return null;

  try {
    return parseJsonPayload(raw) as {
      confidence: number;
      questions: Array<{
        id: string;
        question: string;
        type: "text" | "choices";
        choices?: string[];
        multi?: boolean;
        required?: boolean;
        placeholder?: string;
      }>;
    };
  } catch (error) {
    console.error("Clarify parse error:", error, {
      outputSnippet: raw.slice(0, 800),
    });
  }

  return null;
};

const extractAxes = (response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: unknown;
  }>;
}):
  | {
      axes: Array<{
        section: string;
        options: Array<{ title: string; summary: string }>;
      }>;
    }
  | null => {
  const raw = response.output_text?.trim();
  if (!raw && response.output) {
    const parts: string[] = [];
    response.output.forEach((item) => {
      const content = item.content;
      if (typeof content === "string") {
        parts.push(content);
      } else if (Array.isArray(content)) {
        content.forEach((chunk) => {
          if (typeof chunk === "string") {
            parts.push(chunk);
          } else if (chunk && typeof chunk === "object" && "text" in chunk) {
            const typed = chunk as { text?: string };
            if (typed.text) parts.push(typed.text);
          }
        });
      }
    });
    if (parts.length > 0) {
      try {
        return parseJsonPayload(parts.join("\n").trim()) as {
          axes: Array<{
            section: string;
            options: Array<{ title: string; summary: string }>;
          }>;
        };
      } catch (error) {
        console.error("Axes parse error:", error, {
          outputSnippet: parts.join("\n").slice(0, 800),
        });
        return null;
      }
    }
  }

  if (!raw) return null;

  try {
    return parseJsonPayload(raw) as {
      axes: Array<{
        section: string;
        options: Array<{ title: string; summary: string }>;
      }>;
    };
  } catch (error) {
    console.error("Axes parse error:", error, {
      outputSnippet: raw.slice(0, 800),
    });
  }

  return null;
};

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !openaiKey) {
      return NextResponse.json(
        { error: "Missing env vars." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profil introuvable." },
        { status: 403 }
      );
    }

    if (!["owner", "coach", "staff"].includes(profile.role)) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select(
        "id, ai_enabled, ai_model, ai_tone, ai_tech_level, ai_style, ai_length, ai_imagery, ai_focus"
      )
      .eq("id", profile.org_id)
      .maybeSingle();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organisation introuvable." },
        { status: 403 }
      );
    }

    if (!org.ai_enabled) {
      return NextResponse.json({ error: "AI disabled." }, { status: 403 });
    }

    const payload = (await request.json()) as AiPayload;
    if (!payload.action) {
      return NextResponse.json({ error: "Action manquante." }, { status: 400 });
    }

    if (
      payload.action === "improve" &&
      (!payload.sectionTitle || !payload.sectionContent)
    ) {
      return NextResponse.json(
        { error: "Section manquante." },
        { status: 400 }
      );
    }

    if (payload.action === "write") {
      if (!payload.sectionTitle) {
        return NextResponse.json(
          { error: "Titre de section manquant." },
          { status: 400 }
        );
      }
      const hasNotes = !!payload.sectionContent?.trim();
      const hasContext = (payload.allSections ?? []).some((section) =>
        section.content?.trim()
      );
      if (!hasNotes && !hasContext) {
        return NextResponse.json(
          { error: "Ajoute du contenu dans une autre section." },
          { status: 400 }
        );
      }
    }

    if (
      (payload.action === "summary" || payload.action === "plan") &&
      (!payload.allSections || payload.allSections.length === 0)
    ) {
      return NextResponse.json(
        { error: "Contenu manquant." },
        { status: 400 }
      );
    }

    const startedAt = Date.now();
    const userId = userData.user.id;
    const orgId = profile.org_id;
    const recordUsage = async (
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null
    ) => {
      if (!admin) return;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const totalTokens =
        usage?.total_tokens ?? (inputTokens + outputTokens);

      await admin.from("ai_usage").insert([
        {
          user_id: userId,
          org_id: orgId,
          action: payload.action,
          model: org.ai_model ?? "gpt-5-mini",
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          duration_ms: Date.now() - startedAt,
        },
      ]);
    };

    if (payload.action === "propagate") {
      if (!payload.sectionTitle || !payload.sectionContent?.trim()) {
        return NextResponse.json(
          { error: "Section source manquante." },
          { status: 400 }
        );
      }
      if (!payload.targetSections || payload.targetSections.length === 0) {
        return NextResponse.json(
          { error: "Aucune section cible." },
          { status: 400 }
        );
      }
    }

    if (payload.action === "clarify") {
      if (!payload.sectionTitle || !payload.sectionContent?.trim()) {
        return NextResponse.json(
          { error: "Section source manquante." },
          { status: 400 }
        );
      }
      if (!payload.targetSections || payload.targetSections.length === 0) {
        return NextResponse.json(
          { error: "Aucune section cible." },
          { status: 400 }
        );
      }
    }

    const settings = resolveSettings(org, payload.settings);
    const context = buildContext(payload.allSections ?? []);
    const systemPrompt = await buildSystemPrompt(
      payload.action,
      settings,
      payload.sectionTitle,
      payload.propagateMode
    );

    const clarificationsText = (payload.clarifications ?? [])
      .map((item) => `- ${item.question}: ${item.answer}`)
      .join("\n");

    const axesText = (payload.axesSelections ?? [])
      .map((item) => `- ${item.section}: ${item.title} - ${item.summary}`.trim())
      .join("\n");

    const sectionsList = (payload.allSections ?? [])
      .map((section) => `- ${section.title}`)
      .join("\n");
    const targetsList = (payload.targetSections ?? [])
      .map((title) => `- ${title}`)
      .join("\n");

    const clarificationsBlock = clarificationsText
      ? `Clarifications du coach:\n${clarificationsText}`
      : "";
    const axesBlock = axesText
      ? `Axes choisis par section:\n${axesText}`
      : "";

    const tpiBlock = payload.tpiContext?.trim()
      ? `Profil TPI (a utiliser si pertinent):\n${payload.tpiContext.trim()}`
      : "";

    const userTemplateKey =
      payload.action === "improve"
        ? "ai_api_user_improve"
        : payload.action === "write"
        ? "ai_api_user_write"
        : payload.action === "clarify"
        ? "ai_api_user_clarify"
        : payload.action === "axes"
        ? "ai_api_user_axes"
        : payload.action === "propagate"
        ? "ai_api_user_propagate"
        : "ai_api_user_summary";

    const userTemplate = await loadPromptSection(userTemplateKey);
    const userPrompt = applyTemplate(userTemplate, {
      sectionTitle: payload.sectionTitle ?? "",
      sectionContent: payload.sectionContent ?? "",
      context: context || "(aucune)",
      propagateMode: payload.propagateMode ?? "empty",
      sectionsList,
      targetsList,
      clarificationsBlock,
      axesBlock,
      tpiBlock,
    });

    const openai = new OpenAI({ apiKey: openaiKey });
    const model = org.ai_model ?? "gpt-5-mini";
    const targetCount = payload.targetSections?.length ?? 0;
    const propagateMaxTokens = Math.min(
      1800,
      Math.max(600, 300 + targetCount * 140)
    );
    const maxTokens =
      payload.action === "improve"
        ? 600
        : payload.action === "clarify"
        ? 500
        : payload.action === "axes"
        ? 700
        : payload.action === "propagate"
        ? propagateMaxTokens
        : maxTokensForLength(settings.length);
    const textConfig =
      payload.action === "propagate"
        ? {
            format: {
              type: "json_schema" as const,
              name: "propagation",
              description:
                "Retourne un objet JSON avec un tableau suggestions (title, content).",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                      },
                      required: ["title", "content"],
                    },
                  },
                },
                required: ["suggestions"],
              },
              strict: true,
            },
          }
        : payload.action === "clarify"
        ? {
            format: {
              type: "json_schema" as const,
              name: "clarify",
              description:
                "Retourne un objet JSON avec confidence (0-1) et questions.",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        question: { type: "string" },
                        type: { type: "string", enum: ["text", "choices"] },
                        choices: {
                          type: "array",
                          items: { type: "string" },
                        },
                        multi: { type: "boolean" },
                        required: { type: "boolean" },
                        placeholder: { type: "string" },
                      },
                      required: [
                        "id",
                        "question",
                        "type",
                        "choices",
                        "multi",
                        "required",
                        "placeholder",
                      ],
                    },
                  },
                },
                required: ["confidence", "questions"],
              },
              strict: true,
            },
          }
        : payload.action === "axes"
        ? {
            format: {
              type: "json_schema" as const,
              name: "axes",
              description:
                "Retourne un objet JSON avec axes (section, options).",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  axes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        section: { type: "string" },
                        options: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              title: { type: "string" },
                              summary: { type: "string" },
                            },
                            required: ["title", "summary"],
                          },
                        },
                      },
                      required: ["section", "options"],
                    },
                  },
                },
                required: ["axes"],
              },
              strict: true,
            },
          }
        : {
            format: { type: "text" as const },
            verbosity: "low" as const,
          };
    const reasoning =
      model.startsWith("gpt-5") ? { effort: "low" as const } : undefined;
    const propagateTool =
      payload.action === "propagate"
        ? {
            type: "function" as const,
            name: "propagate_sections",
            description:
              "Genere des suggestions pour chaque section cible du rapport.",
            strict: true,
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      content: { type: "string" },
                    },
                    required: ["title", "content"],
                  },
                },
              },
              required: ["suggestions"],
            },
          }
        : null;

    const response = await openai.responses.create({
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
      max_output_tokens: maxTokens,
      text: textConfig,
      ...(propagateTool
        ? {
            tools: [propagateTool],
            tool_choice: { type: "function", name: "propagate_sections" },
            parallel_tool_calls: false,
          }
        : {}),
      ...(reasoning ? { reasoning } : {}),
    });
    let usage = response.usage;

    if (payload.action === "clarify") {
      const clarified = extractClarify(response);
      if (clarified) {
        const confidence = Number.isFinite(clarified.confidence)
          ? Math.min(1, Math.max(0, clarified.confidence))
          : 0.5;
        await recordUsage(usage);
        return NextResponse.json({
          confidence,
          questions: clarified.questions ?? [],
        });
      }

      return NextResponse.json(
        { error: "JSON invalide." },
        { status: 502 }
      );
    }

    if (payload.action === "axes") {
      const axes = extractAxes(response);
      if (axes) {
        await recordUsage(usage);
        return NextResponse.json({ axes: axes.axes ?? [] });
      }

      return NextResponse.json({ error: "JSON invalide." }, { status: 502 });
    }

    if (payload.action === "propagate") {
      const suggestions = extractSuggestions(response);
      if (suggestions) {
        await recordUsage(usage);
        return NextResponse.json({ suggestions });
      }

      const retry = await openai.responses.create({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: maxTokens,
        text: textConfig,
        ...(propagateTool
          ? {
              tools: [propagateTool],
              tool_choice: { type: "function", name: "propagate_sections" },
              parallel_tool_calls: false,
            }
          : {}),
        ...(reasoning ? { reasoning } : {}),
      });

      const retrySuggestions = extractSuggestions(retry);
      if (retrySuggestions) {
        usage = retry.usage ?? usage;
        await recordUsage(usage);
        return NextResponse.json({ suggestions: retrySuggestions });
      }

      const outputDebug = (response.output ?? []).map((item) => ({
        type: (item as { type?: string }).type,
        hasArguments:
          typeof (item as { arguments?: string }).arguments === "string",
      }));
      console.error("AI empty propagation response", {
        model,
        outputCount: response.output?.length ?? 0,
        retryCount: retry.output?.length ?? 0,
        outputDebug,
      });

      return NextResponse.json(
        { error: "JSON invalide." },
        { status: 502 }
      );
    }

    const outputText = response.output_text?.trim();
    const output = response.output ?? [];
    const parts: string[] = [];

    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (typeof content === "string") {
        parts.push(content);
      } else if (Array.isArray(content)) {
        for (const chunk of content) {
          if (typeof chunk === "string") {
            parts.push(chunk);
          } else if (
            chunk &&
            typeof chunk === "object" &&
            "type" in chunk
          ) {
            const typed = chunk as {
              type: string;
              text?: string;
              refusal?: string;
            };
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

      if (item && typeof item === "object" && "type" in item) {
        const typedItem = item as { type?: string; text?: string; refusal?: string };
        if (typedItem.type === "output_text" && typedItem.text) {
          parts.push(typedItem.text);
        } else if (typedItem.type === "refusal" && typedItem.refusal) {
          parts.push(`Refus: ${typedItem.refusal}`);
        }
      }
    }

    const fallbackText = parts.join("\n").trim();
    let text = outputText || fallbackText;

    if (!text) {
      const retry = await openai.responses.create({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: maxTokens,
        text: textConfig,
        ...(propagateTool
          ? {
              tools: [propagateTool],
              tool_choice: { type: "function", name: "propagate_sections" },
              parallel_tool_calls: false,
            }
          : {}),
        ...(reasoning ? { reasoning } : {}),
      });

      const retryParts: string[] = [];
      const retryOutput = retry.output ?? [];
      for (const item of retryOutput) {
        const content = (item as { content?: unknown }).content;
        if (typeof content === "string") {
          retryParts.push(content);
        } else if (Array.isArray(content)) {
          for (const chunk of content) {
            if (typeof chunk === "string") {
              retryParts.push(chunk);
            } else if (chunk && typeof chunk === "object" && "type" in chunk) {
              const typed = chunk as {
                type: string;
                text?: string;
                refusal?: string;
              };
              if (typed.type === "output_text" && typed.text) {
                retryParts.push(typed.text);
              } else if (typed.type === "text" && typed.text) {
                retryParts.push(typed.text);
              } else if (typed.type === "refusal" && typed.refusal) {
                retryParts.push(`Refus: ${typed.refusal}`);
              }
            }
          }
        }

        if (item && typeof item === "object" && "type" in item) {
          const typedItem = item as {
            type?: string;
            text?: string;
            refusal?: string;
          };
          if (typedItem.type === "output_text" && typedItem.text) {
            retryParts.push(typedItem.text);
          } else if (typedItem.type === "refusal" && typedItem.refusal) {
            retryParts.push(`Refus: ${typedItem.refusal}`);
          }
        }
      }

      const retryText =
        retry.output_text?.trim() ?? retryParts.join("\n").trim();

      text = retryText;
      if (text) {
        usage = retry.usage ?? usage;
      }
      if (!text) {
        const outputDebug = (response.output ?? []).map((item) => {
          const content = (item as { content?: unknown }).content;
          return {
            type: (item as { type?: string }).type,
            contentType: Array.isArray(content)
              ? (content as Array<{ type?: string }>)
                  .map((chunk) => chunk.type ?? typeof chunk)
              : typeof content,
          };
        });
        console.error("AI empty response", {
          model,
          firstOutputText: outputText,
          firstOutputCount: response.output?.length ?? 0,
          retryOutputText: retry.output_text,
          retryOutputCount: retry.output?.length ?? 0,
          outputDebug,
        });
      }
    }

    if (!text) {
      return NextResponse.json(
        { error: "Empty response." },
        { status: 502 }
      );
    }

    if (text.startsWith("Refus:")) {
      return NextResponse.json({ error: text }, { status: 403 });
    }

    await recordUsage(usage);
    return NextResponse.json({
      text: stripLeadingTitle(text, payload.sectionTitle),
    });
  } catch (error) {
    console.error("AI route error:", error);
    return NextResponse.json(
      { error: "Erreur IA." },
      { status: 500 }
    );
  }
}
