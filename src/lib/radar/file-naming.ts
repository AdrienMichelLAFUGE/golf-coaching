const RADAR_TECH_OPTIONS = [
  { id: "flightscope", label: "Flightscope (FS)", prefix: "FS" },
  { id: "trackman", label: "Trackman (TM)", prefix: "TM" },
  { id: "smart2move", label: "Smart2move (S2M)", prefix: "S2M" },
] as const;

type RadarTech = (typeof RADAR_TECH_OPTIONS)[number]["id"];

const isRadarTech = (value: string): value is RadarTech =>
  RADAR_TECH_OPTIONS.some((option) => option.id === value);

const getRadarTechMeta = (value: RadarTech) =>
  RADAR_TECH_OPTIONS.find((option) => option.id === value) ?? RADAR_TECH_OPTIONS[0];

const getRadarTechLabel = (source?: string | null) =>
  RADAR_TECH_OPTIONS.find((option) => option.id === source)?.label ?? "datas";

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFileExtension = (name?: string | null) => {
  if (!name) return "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
};

const buildRadarFileDisplayName = ({
  tech,
  studentName,
  reportDate,
  club,
  originalName,
  fallbackDate = new Date(),
}: {
  tech: RadarTech;
  studentName?: string | null;
  reportDate?: string | null;
  club?: string | null;
  originalName?: string | null;
  fallbackDate?: Date;
}) => {
  const techMeta = getRadarTechMeta(tech);
  const studentLabel = studentName?.trim() || "Eleve";
  const clubLabel = club?.trim() || "Club inconnu";
  const reportLabel = reportDate?.trim() || formatDateInput(fallbackDate);
  const extension = getFileExtension(originalName);
  const baseName = `${techMeta.prefix} - ${studentLabel} - ${reportLabel} - ${clubLabel}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${baseName}${extension}`;
};

export {
  RADAR_TECH_OPTIONS,
  buildRadarFileDisplayName,
  getRadarTechLabel,
  getRadarTechMeta,
  isRadarTech,
};
export type { RadarTech };
