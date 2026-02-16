type WorkspaceScope = {
  activeOrgId: string | null | undefined;
  reportOrgId: string | null | undefined;
};

type EditScope = WorkspaceScope & {
  originShareId: string | null | undefined;
};

export const isReportInActiveWorkspace = ({
  activeOrgId,
  reportOrgId,
}: WorkspaceScope): boolean => {
  if (!activeOrgId) return true;
  return reportOrgId === activeOrgId;
};

export const canEditReport = ({
  activeOrgId,
  reportOrgId,
  originShareId,
}: EditScope): boolean =>
  isReportInActiveWorkspace({ activeOrgId, reportOrgId }) && !originShareId;

export const canDeleteReport = ({
  activeOrgId,
  reportOrgId,
}: WorkspaceScope): boolean =>
  isReportInActiveWorkspace({ activeOrgId, reportOrgId });
