"use server";

import { createClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";

type ExtractedTest = {
  test_name: string;
  result_color: "green" | "orange" | "red";
  mini_summary: string;
  details: string;
  details_translated: string;
  position: number;
};

const toLanguageLabel = (locale: string | null) => {
  if (!locale) return "francais";
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("fr")) return "francais";
  if (normalized.startsWith("en")) return "anglais";
  return "francais";
};

const toFileType = (mime?: string | null) => {
  if (!mime) return null;
  if (mime === "application/pdf") return "pdf" as const;
  if (mime.startsWith("image/")) return "image" as const;
  return null;
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
  const { reportId } = (await req.json()) as { reportId?: string };
  if (!reportId) {
    return Response.json({ error: "reportId requis." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !openaiKey) {
    return Response.json(
      { error: "Configuration serveur incomplete." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: req.headers.get("authorization") ?? "" },
    },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: report, error: reportError } = await supabase
    .from("tpi_reports")
    .select("id, org_id, student_id, file_url, file_type, original_name")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    return Response.json({ error: "Rapport TPI introuvable." }, { status: 404 });
  }

  const { data: orgData } = await admin
    .from("organizations")
    .select("locale")
    .eq("id", report.org_id)
    .single();

  const { data: fileData, error: fileError } = await admin.storage
    .from("tpi-reports")
    .download(report.file_url);

  if (fileError || !fileData) {
    await admin
      .from("tpi_reports")
      .update({ status: "error" })
      .eq("id", reportId);
    return Response.json({ error: "Fichier TPI introuvable." }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const language = toLanguageLabel(orgData?.locale ?? "fr-FR");
  const openai = new OpenAI({ apiKey: openaiKey });

  let extractedTests: ExtractedTest[] = [];
  let pdfFileId: string | null = null;

  try {
    const systemPrompt =
      "Tu es un expert TPI. Analyse un rapport TPI et retourne un JSON strict." +
      " Ne mets pas de markdown." +
      " details doit etre une citation mot pour mot du rapport, sans reformulation ni traduction." +
      " Ne corrige rien, conserve exactement la ponctuation et les erreurs s il y en a." +
      ` details_translated doit etre la traduction en ${language} du contenu details.` +
      " Si la langue est anglais, details_translated doit etre identique a details." +
      ` mini_summary doit etre en ${language} et donner un resume tres court du contenu du test.` +
      " mini_summary doit parler du contenu (ex: limitation/mobilite) et ne jamais etre un statut." +
      " N utilise jamais des formulations du type 'resultat non satisfaisant'." +
      " Le resultat couleur vient du point colore a droite de chaque test (rouge/orange/vert)." +
      " Choisis toujours une couleur parmi rouge/orange/vert." +
      " Extraction exhaustive: ne saute aucun test, y compris en fin de document." +
      " Liste de tests TPI courants (pour verifier seulement, ne pas inventer si absent): " +
      tpiKnownTests.join(", ") +
      ".";

    if (report.file_type === "pdf") {
      const uploaded = await openai.files.create({
        file: await toFile(
          buffer,
          report.original_name ?? "rapport-tpi.pdf"
        ),
        purpose: "user_data",
      });
      pdfFileId = uploaded.id;
    }

    if (report.file_type === "pdf" && !pdfFileId) {
      throw new Error("Fichier PDF TPI manquant.");
    }

    const userContent =
      report.file_type === "pdf"
        ? [
            {
              type: "input_text" as const,
              text: "Analyse ce fichier PDF TPI et extrait toutes les sections.",
            },
            {
              type: "input_file" as const,
              file_id: pdfFileId,
            },
          ]
        : [
            {
              type: "input_text" as const,
              text: "Analyse cette image du rapport TPI et extrait toutes les sections.",
            },
            {
              type: "input_image" as const,
              image_url: `data:${fileData.type || "image/png"};base64,${buffer.toString(
                "base64"
              )}`,
              detail: "auto",
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
    let outputText = extractOutputText(response);
    if (!outputText) {
      const outputDebug = (response.output ?? []).map((item) => ({
        type: (item as { type?: string }).type,
      }));
      console.error("TPI empty response", {
        status: (response as { status?: string }).status,
        incomplete: (response as { incomplete_details?: unknown })
          .incomplete_details,
        error: (response as { error?: unknown }).error,
        outputCount: response.output?.length ?? 0,
        outputDebug,
      });
      throw new Error("Reponse TPI vide.");
    }

    let parsed: { tests: ExtractedTest[] };
    try {
      parsed = JSON.parse(outputText) as { tests: ExtractedTest[] };
    } catch (error) {
      const retry = await callExtract(12000);
      outputText = extractOutputText(retry);
      if (!outputText) {
        throw new Error("Reponse TPI vide.");
      }
      parsed = JSON.parse(outputText) as { tests: ExtractedTest[] };
    }

    if (pdfFileId) {
      try {
        await openai.files.delete(pdfFileId);
      } catch {
        // Ignore cleanup errors.
      }
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
        position:
          typeof test.position === "number" ? test.position : index + 1,
      };
    });
  } catch (error) {
    if (pdfFileId) {
      try {
        await openai.files.delete(pdfFileId);
      } catch {
        // Ignore cleanup errors.
      }
    }
    await admin
      .from("tpi_reports")
      .update({ status: "error" })
      .eq("id", reportId);
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
