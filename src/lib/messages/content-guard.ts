import "server-only";

import type { MessagingGuardMode } from "@/lib/messages/types";

export type MessageContentFlagType = "email" | "phone" | "url" | "keyword";

export type MessageContentFlag = {
  type: MessageContentFlagType;
  matchedValue: string;
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_REGEX =
  /\b((https?:\/\/[^\s/$.?#].[^\s]*)|(www\.[^\s/$.?#].[^\s]*))\b/gi;
const PHONE_REGEX = /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g;

const dedupeFlags = (flags: MessageContentFlag[]): MessageContentFlag[] => {
  const keySet = new Set<string>();
  const result: MessageContentFlag[] = [];

  for (const flag of flags) {
    const normalizedValue = flag.matchedValue.trim().toLowerCase();
    if (!normalizedValue) continue;

    const key = `${flag.type}:${normalizedValue}`;
    if (keySet.has(key)) continue;
    keySet.add(key);
    result.push({
      type: flag.type,
      matchedValue: flag.matchedValue.trim().slice(0, 120),
    });
  }

  return result;
};

const extractFlagsByRegex = (
  body: string,
  regex: RegExp,
  type: MessageContentFlagType
): MessageContentFlag[] => {
  const matches = body.match(regex) ?? [];
  return matches.map((matchedValue) => ({ type, matchedValue }));
};

export const detectMessageContentFlags = (
  body: string,
  sensitiveWords: string[]
): MessageContentFlag[] => {
  const normalizedBody = body.trim();
  if (!normalizedBody) return [];

  const flags: MessageContentFlag[] = [
    ...extractFlagsByRegex(normalizedBody, EMAIL_REGEX, "email"),
    ...extractFlagsByRegex(normalizedBody, PHONE_REGEX, "phone"),
    ...extractFlagsByRegex(normalizedBody, URL_REGEX, "url"),
  ];

  const bodyLower = normalizedBody.toLowerCase();
  for (const word of sensitiveWords) {
    const normalizedWord = word.trim().toLowerCase();
    if (!normalizedWord) continue;
    if (bodyLower.includes(normalizedWord)) {
      flags.push({ type: "keyword", matchedValue: normalizedWord });
    }
  }

  return dedupeFlags(flags);
};

export const shouldBlockMessageForMinorThread = (
  guardMode: MessagingGuardMode,
  isMinorThread: boolean,
  flags: MessageContentFlag[]
) => guardMode === "block" && isMinorThread && flags.length > 0;
