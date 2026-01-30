export const SHARE_STATUSES = [
  "pending_coach",
  "pending_student",
  "active",
  "rejected_coach",
  "rejected_student",
  "revoked",
] as const;

export type ShareStatus = (typeof SHARE_STATUSES)[number];

export const getViewerShareAccess = (status: ShareStatus | null) => ({
  canRead: status === "active",
  canWrite: false,
});
