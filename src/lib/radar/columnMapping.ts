export type RadarColumn = {
  key: string;
  group: string | null;
  label: string;
  unit?: string | null;
};

export type CanonicalField =
  | "shot_index"
  | "shot_type"
  | "carry"
  | "total"
  | "roll"
  | "lateral"
  | "curve"
  | "club_speed"
  | "ball_speed"
  | "spin_rpm"
  | "spin_axis"
  | "spin_loft"
  | "smash"
  | "launch_v"
  | "launch_h"
  | "descent_v"
  | "height"
  | "time"
  | "path"
  | "ftp"
  | "ftt"
  | "dloft"
  | "aoa"
  | "low_point"
  | "swing_plane_v"
  | "swing_plane_h"
  | "impact_lat"
  | "impact_vert";

export type ColumnMap = Partial<Record<CanonicalField, RadarColumn>>;

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const hasToken = (text: string, token: string) => text.includes(token);

const aliases: Record<CanonicalField, string[]> = {
  shot_index: ["shot_index", "shot #", "shot", "shot number", "#"],
  shot_type: ["shot_type", "shot type", "type"],
  carry: ["distance_carry", "carry"],
  total: ["distance_total", "total"],
  roll: ["distance_roll", "roll"],
  lateral: ["distance_lateral", "lateral", "side", "sideways"],
  curve: ["distance_curve", "curve dist", "curve"],
  club_speed: ["speed_club", "club speed", "club mph", "club"],
  ball_speed: ["speed_ball", "ball speed", "ball mph", "ball"],
  spin_rpm: ["spin_rpm", "rpm", "spin"],
  spin_axis: ["spin_axis", "spin axis", "axis"],
  spin_loft: ["spin_loft", "spin loft"],
  smash: ["smash_factor", "smash", "factor"],
  launch_v: ["ball_angle_vertical", "launch v", "launch vertical", "vertical"],
  launch_h: ["ball_angle_horizontal", "launch h", "launch horizontal", "horizontal"],
  descent_v: ["ball_angle_descent", "descent v", "descent"],
  height: ["flight_height", "height"],
  time: ["flight_time", "time"],
  path: ["club_path", "path"],
  ftp: ["club_face_to_path", "ftp", "face to path"],
  ftt: ["club_face_to_target", "ftt", "face to target"],
  dloft: ["club_dynamic_loft", "d loft", "dynamic loft"],
  aoa: ["club_aoa", "aoa", "angle of attack"],
  low_point: ["club_low_point", "low point"],
  swing_plane_v: ["swing_plane_vertical", "swing plane vertical"],
  swing_plane_h: ["swing_plane_horizontal", "swing plane horizontal"],
  impact_lat: [
    "face_impact_lateral",
    "impact_face_lateral",
    "face impact lateral",
    "impact face lateral",
    "impact lateral",
    "impact x",
  ],
  impact_vert: [
    "face_impact_vertical",
    "impact_face_vertical",
    "impact vertical",
    "impact y",
    "face impact vertical",
    "impact face vertical",
  ],
};

const buildTokens = (column: RadarColumn) => {
  const label = normalizeToken(column.label || "");
  const group = normalizeToken(column.group || "");
  const key = normalizeToken(column.key || "");
  return `${key} ${group} ${label}`.trim();
};

export const buildColumnMap = (columns: RadarColumn[]): ColumnMap => {
  const map: ColumnMap = {};
  columns.forEach((column) => {
    const tokens = buildTokens(column);
    (Object.keys(aliases) as CanonicalField[]).forEach((canonical) => {
      if (map[canonical]) return;
      const patterns = aliases[canonical];
      if (patterns.some((pattern) => hasToken(tokens, normalizeToken(pattern)))) {
        map[canonical] = column;
      }
    });
  });
  return map;
};

export const getUnit = (map: ColumnMap, key: CanonicalField) => map[key]?.unit ?? null;
