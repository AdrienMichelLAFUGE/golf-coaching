export type DidacticHintState = {
  seenAt?: string;
  dismissedAt?: string;
};

const DIDACTIC_HINTS_STORAGE_KEY = "gc.didactic_hints.v1";

const readDidacticHints = (): Record<string, DidacticHintState> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DIDACTIC_HINTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DidacticHintState> | null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

const writeDidacticHints = (value: Record<string, DidacticHintState>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIDACTIC_HINTS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage quota/privacy errors and keep runtime flow safe.
  }
};

export const getDidacticHintState = (hintId: string): DidacticHintState => {
  if (!hintId) return {};
  const all = readDidacticHints();
  return all[hintId] ?? {};
};

export const markDidacticHintSeen = (hintId: string) => {
  if (!hintId) return;
  const all = readDidacticHints();
  const previous = all[hintId] ?? {};
  if (previous.seenAt) return;
  all[hintId] = {
    ...previous,
    seenAt: new Date().toISOString(),
  };
  writeDidacticHints(all);
};

export const dismissDidacticHint = (hintId: string) => {
  if (!hintId) return;
  const all = readDidacticHints();
  const previous = all[hintId] ?? {};
  all[hintId] = {
    ...previous,
    dismissedAt: new Date().toISOString(),
  };
  writeDidacticHints(all);
};
