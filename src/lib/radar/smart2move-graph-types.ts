export const SMART2MOVE_GRAPH_TYPE_VALUES = [
  "fz",
  "fx",
  "fy",
  "mz",
  "cop",
  "pressure_shift",
  "stance_width",
  "foot_flare",
  "grf_3d",
] as const;

export type Smart2MoveGraphType = (typeof SMART2MOVE_GRAPH_TYPE_VALUES)[number];
export type Smart2MovePlateType = "1d" | "3d";

type Smart2MoveGraphMeta = {
  id: Smart2MoveGraphType;
  label: string;
  shortLabel: string;
  extractPromptSection: string;
  requiredPlateType: Smart2MovePlateType;
};

export const SMART2MOVE_GRAPH_OPTIONS: readonly Smart2MoveGraphMeta[] = [
  {
    id: "fz",
    label: "Force verticale (Fz)",
    shortLabel: "Fz",
    extractPromptSection: "radar_extract_smart2move_fz_system",
    requiredPlateType: "1d",
  },
  {
    id: "fx",
    label: "Force antero-posterieure (Fx)",
    shortLabel: "Fx",
    extractPromptSection: "radar_extract_smart2move_fx_system",
    requiredPlateType: "3d",
  },
  {
    id: "fy",
    label: "Force laterale (Fy)",
    shortLabel: "Fy",
    extractPromptSection: "radar_extract_smart2move_fy_system",
    requiredPlateType: "3d",
  },
  {
    id: "mz",
    label: "Torque vertical (Mz)",
    shortLabel: "Mz",
    extractPromptSection: "radar_extract_smart2move_mz_system",
    requiredPlateType: "3d",
  },
  {
    id: "cop",
    label: "Centre de pression (CoP)",
    shortLabel: "CoP",
    extractPromptSection: "radar_extract_smart2move_cop_system",
    requiredPlateType: "1d",
  },
  {
    id: "pressure_shift",
    label: "Pressure Shift / Repartition gauche-droite (%)",
    shortLabel: "Pressure Shift",
    extractPromptSection: "radar_extract_smart2move_pressure_shift_system",
    requiredPlateType: "1d",
  },
  {
    id: "stance_width",
    label: "Stance / Largeur d appuis",
    shortLabel: "Stance",
    extractPromptSection: "radar_extract_smart2move_stance_system",
    requiredPlateType: "1d",
  },
  {
    id: "foot_flare",
    label: "Foot Flare (angle des pieds)",
    shortLabel: "Foot Flare",
    extractPromptSection: "radar_extract_smart2move_foot_flare_system",
    requiredPlateType: "1d",
  },
  {
    id: "grf_3d",
    label: "Force vectorielle 3D / GRF",
    shortLabel: "GRF 3D",
    extractPromptSection: "radar_extract_smart2move_grf_system",
    requiredPlateType: "3d",
  },
];

export const SMART2MOVE_VERIFY_PROMPT_SECTION = "radar_extract_smart2move_verify_system";

export const isSmart2MoveGraphType = (value: string): value is Smart2MoveGraphType =>
  SMART2MOVE_GRAPH_TYPE_VALUES.includes(value as Smart2MoveGraphType);

export const getSmart2MoveGraphMeta = (type: Smart2MoveGraphType) => {
  const option = SMART2MOVE_GRAPH_OPTIONS.find((item) => item.id === type);
  if (!option) {
    throw new Error(`Unknown Smart2Move graph type: ${type}`);
  }
  return option;
};

export const isSmart2MoveGraphCompatibleWithPlate = (
  graphType: Smart2MoveGraphType,
  plateType: Smart2MovePlateType
) => {
  const meta = getSmart2MoveGraphMeta(graphType);
  if (meta.requiredPlateType === "1d") return true;
  return plateType === "3d";
};
