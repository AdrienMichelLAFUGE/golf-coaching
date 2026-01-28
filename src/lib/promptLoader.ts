import { readFile } from "node:fs/promises";
import path from "node:path";

const promptCache = new Map<string, Record<string, string>>();

const parsePrompts = (content: string) => {
  const lines = content.split(/\r?\n/);
  const map: Record<string, string> = {};
  let currentKey: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentKey) return;
    const text = buffer.join("\n").trim();
    map[currentKey] = text;
  };

  lines.forEach((line) => {
    const match = line.match(/^##\s+(.+)\s*$/);
    if (match) {
      flush();
      currentKey = match[1].trim();
      buffer = [];
      return;
    }
    if (currentKey) {
      buffer.push(line);
    }
  });

  flush();
  return map;
};

export const loadPromptSection = async (
  section: string,
  filePath = path.join(process.cwd(), "prompts", "general-ai-prompt.md")
) => {
  const cached = promptCache.get(filePath);
  if (cached && cached[section]) {
    return cached[section];
  }

  const content = await readFile(filePath, "utf8");
  const parsed = parsePrompts(content);
  promptCache.set(filePath, parsed);
  return parsed[section] ?? "";
};

export const applyTemplate = (
  template: string,
  vars: Record<string, string | number | null | undefined>
) =>
  template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = vars[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
