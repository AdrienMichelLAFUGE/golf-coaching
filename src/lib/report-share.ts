import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

const normalizeAscii = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");

const escapePdfText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrapText = (value: string, maxChars = 92) => {
  const normalized = normalizeAscii(value).replace(/\r\n?/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) return [""];

  const bulletMatch = trimmed.match(/^([-*]|\d+\.)\s+/);
  const prefix = bulletMatch ? `${bulletMatch[1]} ` : "";
  const body = bulletMatch ? trimmed.slice(bulletMatch[0].length) : trimmed;

  const words = body.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = prefix;
  const continuationPrefix = " ".repeat(prefix.length);

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = current.endsWith(" ") ? `${current}${word}` : `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = `${continuationPrefix}${word}`;
  }
  if (current) lines.push(current);
  return lines;
};

const normalizeRichText = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*(\d+)\)\s+/gm, "$1. ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n");

const describeMediaNote = (input: {
  type?: string | null;
  hasRichMedia?: boolean;
  mediaCount?: number;
}) => {
  if (!input.hasRichMedia && !input.mediaCount) return null;
  const mediaCount = input.mediaCount ?? 0;
  const label =
    input.type === "image"
      ? "images"
      : input.type === "video"
        ? "videos"
        : input.type === "radar"
          ? "graphiques/donnees"
          : "contenus multimedia";
  if (mediaCount > 0) {
    return `Note media: ${mediaCount} ${label}. Consultez la version SwingFlow pour voir ce contenu.`;
  }
  return "Note media: contenu multimedia disponible uniquement dans SwingFlow.";
};

const toPdfLines = (input: {
  title: string;
  reportDate: string;
  studentName: string;
  sections: Array<{
    title: string;
    content: string;
    type?: string | null;
    hasRichMedia?: boolean;
    mediaCount?: number;
  }>;
}) => {
  const lines: string[] = [];
  lines.push(`Rapport SwingFlow: ${input.title}`);
  lines.push(`Date: ${input.reportDate}`);
  lines.push(`Eleve: ${input.studentName}`);
  lines.push("");

  input.sections.forEach((section, index) => {
    lines.push(`${index + 1}. ${section.title}`);
    const contentLines = normalizeRichText(section.content).split("\n");
    if (contentLines.every((line) => !line.trim())) {
      lines.push("Aucun contenu.");
    } else {
      contentLines.forEach((line) => {
        if (!line.trim()) {
          if (lines[lines.length - 1] !== "") {
            lines.push("");
          }
          return;
        }
        wrapText(line).forEach((wrapped) => lines.push(wrapped));
      });
    }
    const mediaNote = describeMediaNote(section);
    if (mediaNote) {
      wrapText(mediaNote).forEach((wrapped) => lines.push(wrapped));
    }
    lines.push("");
  });

  return lines.map((line) => normalizeAscii(line));
};

const buildPdfBufferFromLines = (lines: string[]) => {
  const pageHeight = 842;
  const marginTop = 52;
  const lineHeight = 14;
  const linesPerPage = Math.floor((pageHeight - marginTop * 2) / lineHeight);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(["Rapport vide."]);

  const objects: Array<{ id: number; content: string }> = [];
  objects.push({
    id: 1,
    content: "<< /Type /Catalog /Pages 2 0 R >>",
  });

  const pageIds: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = 4 + index * 2;
    pageIds.push(pageId);
  }

  objects.push({
    id: 2,
    content: `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`,
  });

  objects.push({
    id: 3,
    content: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  });

  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const streamLines = [
      "BT",
      "/F1 11 Tf",
      `50 ${pageHeight - marginTop} Td`,
      `${lineHeight} TL`,
    ];
    pageLines.forEach((line, lineIndex) => {
      const escaped = escapePdfText(line);
      streamLines.push(`(${escaped}) Tj`);
      if (lineIndex !== pageLines.length - 1) {
        streamLines.push("T*");
      }
    });
    streamLines.push("ET");
    const stream = `${streamLines.join("\n")}\n`;

    objects.push({
      id: contentId,
      content: `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`,
    });

    objects.push({
      id: pageId,
      content:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
  });

  const sortedObjects = objects.sort((a, b) => a.id - b.id);
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  sortedObjects.forEach((object) => {
    offsets[object.id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${object.id} 0 obj\n${object.content}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${sortedObjects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= sortedObjects.length; id += 1) {
    const offset = String(offsets[id] ?? 0).padStart(10, "0");
    pdf += `${offset} 00000 n \n`;
  }
  pdf +=
    "trailer\n" +
    `<< /Size ${sortedObjects.length + 1} /Root 1 0 R >>\n` +
    "startxref\n" +
    `${xrefOffset}\n` +
    "%%EOF\n";

  return Buffer.from(pdf, "utf8");
};

export const buildSharedReportPdf = (input: {
  title: string;
  reportDate: string;
  studentName: string;
  sections: Array<{
    title: string;
    content: string;
    type?: string | null;
    hasRichMedia?: boolean;
    mediaCount?: number;
  }>;
}) => {
  const lines = toPdfLines(input);
  return buildPdfBufferFromLines(lines);
};

export const findAuthUserByEmail = async (
  admin: SupabaseClient,
  email: string
): Promise<User | null> => {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) return null;
    const users = data?.users ?? [];
    const found = users.find((user) => (user.email ?? "").toLowerCase() === normalized);
    if (found) return found;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
};
