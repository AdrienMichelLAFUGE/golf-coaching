import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type AiAction = "improve" | "write" | "summary" | "propagate" | "plan";

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

const buildSystemPrompt = (
  action: AiAction,
  settings: AiSettings,
  sectionTitle?: string,
  propagateMode?: "empty" | "append"
) => {
  const styleHint =
    settings.style === "structure"
      ? "Formatte la reponse en points clairs et titres courts."
      : "Ecris un texte fluide et professionnel.";

  const lengthHint =
    settings.length === "court"
      ? "Fais court (60 a 90 mots)."
      : settings.length === "long"
      ? "Developpe davantage (220 a 320 mots)."
      : "Longueur normale (120 a 180 mots).";

  const imageryHint =
    settings.imagery === "faible"
      ? "Evite les metaphore."
      : settings.imagery === "fort"
      ? "Utilise des images/metaphores pour rendre le texte vivant."
      : "Utilise un peu d image sans en abuser.";

  const focusHint =
    settings.focus === "technique"
      ? "Concentre toi sur la technique."
      : settings.focus === "mental"
      ? "Concentre toi sur le mental."
      : settings.focus === "strategie"
      ? "Concentre toi sur la strategie."
      : "Melange technique, mental et strategie.";

  const base =
    "Tu es un coach de golf expert. Reponds en francais." +
    ` Ton: ${settings.tone}.` +
    ` Niveau: ${settings.techLevel}. ` +
    imageryHint +
    " " +
    focusHint +
    " Reste clair et utile. Ne t arrete pas au milieu d une phrase. Donne une version complete.";

  if (action === "improve") {
    return (
      `${base} Corrige uniquement l orthographe, la grammaire et la ponctuation.` +
      " Ne reformule pas. Ne rajoute rien. Ne retire rien." +
      " Conserve la longueur et la structure." +
      " Ne renvoie que le texte corrige, sans titre."
    );
  }

  if (action === "write") {
    return (
      `${base} ${styleHint} ${lengthHint} ` +
      `Ecris la section "${sectionTitle ?? "Section"}" a partir des notes.` +
      " Ne resumer pas la seance globale." +
      " Ne cite pas d elements non presentes dans les notes." +
      " Si les notes sont vides, base toi uniquement sur le contexte des autres sections." +
      " Si une info manque, reste general ou signale qu il faut completer." +
      " N inclus pas le titre dans la reponse."
    );
  }

  if (action === "propagate") {
    const modeHint =
      propagateMode === "append"
        ? "Ajoute un nouveau paragraphe complementaire sans repeter ce qui existe deja. Commence le paragraphe par un connecteur (ensuite, puis, par la suite) pour garder un enchainement naturel."
        : "Ecris un contenu initial si la section est vide.";
    return (
      `${base} ${styleHint} ` +
      "Tu dois propager la section source vers les autres sections du rapport." +
      " Pour chaque section cible, redige un texte court (2 a 4 phrases)." +
      " Adapte le contenu au titre de la section cible." +
      " Ne resumer pas toute la seance." +
      " Ne cree pas d infos non presentes dans la section source." +
      " N utilise pas de guillemets doubles dans les contenus." +
      ` ${modeHint}` +
      " Si tu n as rien de pertinent, renvoie une chaine vide." +
      " Ne mets pas de titre dans les contenus."
    );
  }

  if (action === "plan") {
    const horizon = inferPlanHorizon(sectionTitle);
    const planTitle = sectionTitle ?? "Plan";
    return (
      `${base} ${styleHint} ` +
      `Genere un plan "${planTitle}" base sur les sections du rapport.` +
      ` Planifie sur ${horizon}.` +
      " Si l horizon est en mois, structure en phases et evite le detail jour par jour." +
      " Ne parle pas de semaine si le titre indique une autre duree." +
      " Donne 4 a 6 actions courtes et concretes, une phrase max chacune." +
      " Sois realiste et progressif, evite les details inutiles." +
      " N inclus pas de titre."
    );
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

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

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

    const settings = resolveSettings(org, payload.settings);
    const context = buildContext(payload.allSections ?? []);
    const systemPrompt = buildSystemPrompt(
      payload.action,
      settings,
      payload.sectionTitle,
      payload.propagateMode
    );

    const userPrompt =
      payload.action === "improve"
        ? `${payload.sectionContent}`
        : payload.action === "write"
        ? `Section: ${payload.sectionTitle}\nNotes de la section:\n${payload.sectionContent ?? ""}\n\nAutres sections (pour coherence, ne pas resumer):\n${context || "(aucune)"}\n\nSi les notes sont vides, propose une version basee sur le contexte.`
        : payload.action === "propagate"
        ? `Section source: ${payload.sectionTitle}\nNotes source:\n${payload.sectionContent}\n\nSections presentes:\n${(payload.allSections ?? [])
            .map((section) => `- ${section.title}`)
            .join("\n")}\n\nSections cibles a remplir:\n${(payload.targetSections ?? [])
            .map((title) => `- ${title}`)
            .join("\n")}`
        : `Sections:\n${context}`;

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

    if (payload.action === "propagate") {
      const suggestions = extractSuggestions(response);
      if (suggestions) {
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
