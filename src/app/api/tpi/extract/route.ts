import { z } from "zod";
import OpenAI, { toFile } from "openai";
import { env } from "@/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { applyTemplate, loadPromptSection } from "@/lib/promptLoader";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type ExtractedTest = {
  test_name: string;
  result_color: "green" | "orange" | "red";
  mini_summary: string;
  details: string;
  details_translated: string;
  position: number;
};

const tpiExtractSchema = z.object({
  reportId: z.string().min(1),
});

const normalizeTestKey = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const toLanguageLabel = (locale: string | null) => {
  if (!locale) return "francais";
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("fr")) return "francais";
  if (normalized.startsWith("en")) return "anglais";
  return "francais";
};

const tpiKnownTests = [
  "Setup Posture",
  "Torso Rotation",
  "Toe Touch",
  "90/90",
  "Single Leg Balance",
  "Lat Test",
  "Seated Trunk Rotation",
  "Pelvic Tilt",
  "Overhead Deep Squat",
  "Lower Quarter Rotation",
  "Cervical Rotation",
  "Wrist Flexion/Extension",
  "Pelvic Rotation",
  "Bridge with Leg Extension",
  "Forearm Rotation",
  "Wrist Hinge",
  "Overhead Press",
];

const buildSchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          test_name: { type: "string" },
          result_color: {
            type: "string",
            enum: ["green", "orange", "red"],
          },
          mini_summary: { type: "string" },
          details: { type: "string" },
          details_translated: { type: "string" },
          position: { type: "integer", minimum: 0 },
        },
        required: [
          "test_name",
          "result_color",
          "mini_summary",
          "details",
          "details_translated",
          "position",
        ],
      },
    },
  },
  required: ["tests"],
});

const buildVerifySchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    is_tpi: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["is_tpi", "reason"],
});

const extractOutputText = (response: {
  output_text?: string | null;
  output?: Array<unknown>;
}) => {
  const direct = response.output_text?.trim();
  if (direct) return direct;

  const parts: string[] = [];
  for (const item of response.output ?? []) {
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

    if (item && typeof item === "object" && "type" in item) {
      const typedItem = item as { type?: string; text?: string; refusal?: string };
      if (typedItem.type === "output_text" && typedItem.text) {
        parts.push(typedItem.text);
      } else if (typedItem.type === "refusal" && typedItem.refusal) {
        parts.push(`Refus: ${typedItem.refusal}`);
      }
    }
  }

  return parts.join("\n").trim();
};

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, tpiExtractSchema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }
  const { reportId } = parsed.data;

  const supabase = createSupabaseServerClientFromRequest(req);
  const admin = createSupabaseAdminClient();
  const openaiKey = env.OPENAI_API_KEY;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }
  const userEmail = userData.user?.email?.toLowerCase() ?? null;
  const isAdmin = userEmail === "adrien.lafuge@outlook.fr";

  const { data: report, error: reportError } = await supabase
    .from("tpi_reports")
    .select("id, org_id, student_id, file_url, file_type, original_name")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    return Response.json({ error: "Rapport TPI introuvable." }, { status: 404 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData || String(profileData.org_id) !== String(report.org_id)) {
    return Response.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: orgData } = await admin
    .from("organizations")
    .select("locale, tpi_enabled")
    .eq("id", report.org_id)
    .single();

  if (!isAdmin && !orgData?.tpi_enabled) {
    return Response.json({ error: "Add-on TPI requis." }, { status: 403 });
  }

  const { data: fileData, error: fileError } = await admin.storage
    .from("tpi-reports")
    .download(report.file_url);

  if (fileError || !fileData) {
    await admin.from("tpi_reports").update({ status: "error" }).eq("id", reportId);
    return Response.json({ error: "Fichier TPI introuvable." }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  if (report.file_type !== "pdf") {
    await admin.from("tpi_reports").update({ status: "error" }).eq("id", reportId);
    return Response.json(
      { error: "Importe uniquement le PDF TPI Pro recu par email." },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const language = toLanguageLabel(orgData?.locale ?? "fr-FR");
  const hasTpiInName = (report.original_name ?? "").toLowerCase().includes("tpi");

  let extractedTests: ExtractedTest[] = [];
  let pdfFileId: string | null = null;
  let usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null = null;

  const recordUsage = async (
    action: string,
    usagePayload: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    } | null,
    durationMs: number
  ) => {
    if (!usagePayload) return;
    const inputTokens = usagePayload.input_tokens ?? 0;
    const outputTokens = usagePayload.output_tokens ?? 0;
    const totalTokens = usagePayload.total_tokens ?? inputTokens + outputTokens;

    try {
      await admin.from("ai_usage").insert([
        {
          user_id: userId,
          org_id: report.org_id,
          action,
          model: "gpt-5.2",
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          duration_ms: durationMs,
        },
      ]);
    } catch (error) {
      console.error("TPI usage logging failed:", error);
    }
  };

  const cleanupOpenAiFile = async () => {
    if (!pdfFileId) return;
    try {
      await openai.files.delete(pdfFileId);
    } catch {
      // Ignore cleanup errors.
    }
  };

  try {
    const uploaded = await openai.files.create({
      file: await toFile(buffer, report.original_name ?? "rapport-tpi.pdf"),
      purpose: "user_data",
    });
    pdfFileId = uploaded.id;
  } catch (error) {
    await admin.from("tpi_reports").update({ status: "error" }).eq("id", reportId);
    console.error("TPI PDF upload error:", error);
    return Response.json(
      { error: "Upload PDF impossible. Reessaie avec le PDF TPI Pro." },
      { status: 500 }
    );
  }

  if (!hasTpiInName) {
    try {
      const verifyStartedAt = Date.now();
      const verifyTemplate = await loadPromptSection("tpi_verify_system");
      const verifyPrompt = applyTemplate(verifyTemplate, {});

      const verifyResponse = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: verifyPrompt }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: applyTemplate(await loadPromptSection("tpi_verify_user"), {
                  tpiKnownTests: tpiKnownTests.join(", "),
                }),
              },
              {
                type: "input_file",
                file_id: pdfFileId,
              },
            ],
          },
        ],
        max_output_tokens: 300,
        text: {
          format: {
            type: "json_schema",
            name: "tpi_verify",
            description: "Confirme si le fichier est un rapport TPI Pro.",
            schema: buildVerifySchema(),
            strict: true,
          },
        },
      });

      const verifyUsage = verifyResponse.usage ?? null;
      const verifyText = extractOutputText(verifyResponse);
      if (!verifyText) {
        throw new Error("Verification TPI vide.");
      }

      const verifyParsed = JSON.parse(verifyText) as {
        is_tpi: boolean;
        reason: string;
      };

      await recordUsage("tpi_verify", verifyUsage, Date.now() - verifyStartedAt);

      if (!verifyParsed.is_tpi) {
        await admin.from("tpi_reports").update({ status: "error" }).eq("id", reportId);
        await cleanupOpenAiFile();
        return Response.json(
          {
            error:
              verifyParsed.reason ||
              "PDF TPI non reconnu. Importe le PDF TPI Pro recu par email.",
          },
          { status: 400 }
        );
      }
    } catch (error) {
      await admin.from("tpi_reports").update({ status: "error" }).eq("id", reportId);
      console.error("TPI PDF verify error:", error);
      await cleanupOpenAiFile();
      return Response.json(
        { error: "Verification TPI impossible. Reessaie avec le PDF TPI Pro." },
        { status: 500 }
      );
    }
  }

  const startedAt = Date.now();

  try {
    const systemTemplate = await loadPromptSection("tpi_extract_system");
    const systemPrompt = applyTemplate(systemTemplate, {
      language,
      tpiKnownTests: tpiKnownTests.join(", "),
    });

    if (report.file_type === "pdf" && !pdfFileId) {
      throw new Error("Fichier PDF TPI manquant.");
    }

    const userContent =
      report.file_type === "pdf"
        ? [
            {
              type: "input_text" as const,
              text: await loadPromptSection("tpi_extract_user_pdf"),
            },
            {
              type: "input_file" as const,
              file_id: pdfFileId,
            },
          ]
        : [
            {
              type: "input_text" as const,
              text: await loadPromptSection("tpi_extract_user_image"),
            },
            {
              type: "input_image" as const,
              image_url: `data:${fileData.type || "image/png"};base64,${buffer.toString(
                "base64"
              )}`,
              detail: "auto" as const,
            },
          ];

    const callExtract = async (maxTokens: number) =>
      openai.responses.create({
        model: "gpt-5.2",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          { role: "user", content: userContent },
        ],
        max_output_tokens: maxTokens,
        text: {
          format: {
            type: "json_schema",
            name: "tpi_extract",
            description: "Retourne tests (liste des tests TPI).",
            schema: buildSchema(),
            strict: true,
          },
        },
      });

    const response = await callExtract(8000);
    usage = response.usage ?? usage;
    let outputText = extractOutputText(response);
    if (!outputText) {
      const outputDebug = (response.output ?? []).map((item) => ({
        type: (item as { type?: string }).type,
      }));
      console.error("TPI empty response", {
        status: (response as { status?: string }).status,
        incomplete: (response as { incomplete_details?: unknown }).incomplete_details,
        error: (response as { error?: unknown }).error,
        outputCount: response.output?.length ?? 0,
        outputDebug,
      });
      throw new Error("Reponse TPI vide.");
    }

    let parsed: { tests: ExtractedTest[] };
    try {
      parsed = JSON.parse(outputText) as { tests: ExtractedTest[] };
    } catch {
      const retry = await callExtract(12000);
      usage = retry.usage ?? usage;
      outputText = extractOutputText(retry);
      if (!outputText) {
        throw new Error("Reponse TPI vide.");
      }
      parsed = JSON.parse(outputText) as { tests: ExtractedTest[] };
    }

    extractedTests = (parsed.tests ?? []).map((test, index) => {
      const color =
        test.result_color === "green" ||
        test.result_color === "orange" ||
        test.result_color === "red"
          ? test.result_color
          : "orange";
      const cleanedSummary = test.mini_summary?.trim();
      const fallbackSummary = test.details
        ? `${test.details.trim().slice(0, 160)}${
            test.details.trim().length > 160 ? "..." : ""
          }`
        : "";
      return {
        test_name: test.test_name?.trim() ?? `Test ${index + 1}`,
        result_color: color,
        mini_summary: cleanedSummary || fallbackSummary,
        details: test.details ?? "",
        details_translated: test.details_translated?.trim() ?? "",
        position: typeof test.position === "number" ? test.position : index + 1,
      };
    });

    const seenTests = new Set<string>();
    extractedTests = extractedTests.filter((test) => {
      const key = `${normalizeTestKey(test.test_name)}|${test.position}`;
      if (seenTests.has(key)) return false;
      seenTests.add(key);
      return true;
    });
    await recordUsage("tpi_extract", usage, Date.now() - startedAt);
    await cleanupOpenAiFile();
  } catch (error) {
    await cleanupOpenAiFile();
    await admin.from("tpi_reports").update({ status: "error" }).eq("id", reportId);
    return Response.json(
      { error: (error as Error).message ?? "Erreur TPI." },
      { status: 500 }
    );
  }

  await admin
    .from("tpi_reports")
    .update({ raw_text: null, status: "ready" })
    .eq("id", reportId);

  await admin.from("tpi_tests").delete().eq("report_id", reportId);

  if (extractedTests.length > 0) {
    const payload = extractedTests.map((test) => ({
      org_id: report.org_id,
      report_id: reportId,
      test_name: test.test_name,
      result_color: test.result_color,
      mini_summary: test.mini_summary,
      details: test.details,
      details_translated: test.details_translated,
      position: test.position,
    }));
    await admin.from("tpi_tests").insert(payload);
  }

  const { data: storedTests } = await admin
    .from("tpi_tests")
    .select("id, test_name, position")
    .eq("report_id", reportId);

  if (storedTests && storedTests.length > 0) {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    storedTests.forEach((test) => {
      const key = `${normalizeTestKey(test.test_name ?? "")}|${test.position ?? 0}`;
      if (seen.has(key)) {
        duplicates.push(String(test.id));
      } else {
        seen.add(key);
      }
    });
    if (duplicates.length > 0) {
      await admin.from("tpi_tests").delete().in("id", duplicates);
    }
  }

  await admin
    .from("students")
    .update({ tpi_report_id: reportId })
    .eq("id", report.student_id);

  const { data: oldReports } = await admin
    .from("tpi_reports")
    .select("id, file_url")
    .eq("student_id", report.student_id)
    .neq("id", reportId);

  if (oldReports && oldReports.length > 0) {
    const paths = oldReports.map((old) => old.file_url);
    await admin.storage.from("tpi-reports").remove(paths);
    await admin
      .from("tpi_tests")
      .delete()
      .in(
        "report_id",
        oldReports.map((old) => old.id)
      );
    await admin
      .from("tpi_reports")
      .delete()
      .in(
        "id",
        oldReports.map((old) => old.id)
      );
  }

  return Response.json({
    status: "ready",
    tests: extractedTests,
  });
}
