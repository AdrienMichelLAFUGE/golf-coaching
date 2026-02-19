export const PARENT_PERMISSION_MODULES = [
  "dashboard",
  "rapports",
  "tests",
  "calendrier",
  "messages",
] as const;

export type ParentPermissionModule = (typeof PARENT_PERMISSION_MODULES)[number];

export type ParentLinkPermissions = Record<ParentPermissionModule, boolean>;

export const DEFAULT_PARENT_LINK_PERMISSIONS: ParentLinkPermissions = {
  dashboard: true,
  rapports: true,
  tests: true,
  calendrier: true,
  messages: true,
};

export const cloneDefaultParentLinkPermissions = (): ParentLinkPermissions => ({
  ...DEFAULT_PARENT_LINK_PERMISSIONS,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const normalizeParentLinkPermissions = (
  value: unknown
): ParentLinkPermissions => {
  const defaults = cloneDefaultParentLinkPermissions();
  if (!isRecord(value)) {
    return defaults;
  }

  const normalized = { ...defaults };
  for (const key of PARENT_PERMISSION_MODULES) {
    const nextValue = value[key];
    if (typeof nextValue === "boolean") {
      normalized[key] = nextValue;
    }
  }

  return normalized;
};
