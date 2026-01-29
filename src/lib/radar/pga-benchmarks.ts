export type PgaBenchmark = {
  club: string;
  club_speed_mph: number;
  attack_angle_deg: number;
  ball_speed_mph: number;
  smash_factor: number;
  launch_angle_deg: number;
  spin_rate_rpm: number;
  max_height_yds: number;
  land_angle_deg: number;
  carry_yds: number;
};

export const PGA_BENCHMARKS: PgaBenchmark[] = [
  {
    club: "Driver",
    club_speed_mph: 113,
    attack_angle_deg: -1.3,
    ball_speed_mph: 167,
    smash_factor: 1.48,
    launch_angle_deg: 10.9,
    spin_rate_rpm: 2686,
    max_height_yds: 32,
    land_angle_deg: 38,
    carry_yds: 275,
  },
  {
    club: "3 Iron",
    club_speed_mph: 98,
    attack_angle_deg: -3.1,
    ball_speed_mph: 142,
    smash_factor: 1.45,
    launch_angle_deg: 10.4,
    spin_rate_rpm: 4630,
    max_height_yds: 27,
    land_angle_deg: 46,
    carry_yds: 212,
  },
  {
    club: "4 Iron",
    club_speed_mph: 96,
    attack_angle_deg: -3.4,
    ball_speed_mph: 137,
    smash_factor: 1.43,
    launch_angle_deg: 11.0,
    spin_rate_rpm: 4836,
    max_height_yds: 28,
    land_angle_deg: 48,
    carry_yds: 203,
  },
  {
    club: "5 Iron",
    club_speed_mph: 94,
    attack_angle_deg: -3.7,
    ball_speed_mph: 132,
    smash_factor: 1.41,
    launch_angle_deg: 12.1,
    spin_rate_rpm: 5361,
    max_height_yds: 31,
    land_angle_deg: 49,
    carry_yds: 194,
  },
  {
    club: "6 Iron",
    club_speed_mph: 92,
    attack_angle_deg: -4.1,
    ball_speed_mph: 127,
    smash_factor: 1.38,
    launch_angle_deg: 14.1,
    spin_rate_rpm: 6231,
    max_height_yds: 30,
    land_angle_deg: 50,
    carry_yds: 183,
  },
  {
    club: "7 Iron",
    club_speed_mph: 90,
    attack_angle_deg: -4.3,
    ball_speed_mph: 120,
    smash_factor: 1.33,
    launch_angle_deg: 16.3,
    spin_rate_rpm: 7097,
    max_height_yds: 32,
    land_angle_deg: 50,
    carry_yds: 172,
  },
  {
    club: "8 Iron",
    club_speed_mph: 87,
    attack_angle_deg: -4.5,
    ball_speed_mph: 115,
    smash_factor: 1.32,
    launch_angle_deg: 18.1,
    spin_rate_rpm: 7998,
    max_height_yds: 31,
    land_angle_deg: 50,
    carry_yds: 160,
  },
  {
    club: "9 Iron",
    club_speed_mph: 85,
    attack_angle_deg: -4.7,
    ball_speed_mph: 109,
    smash_factor: 1.28,
    launch_angle_deg: 20.4,
    spin_rate_rpm: 8647,
    max_height_yds: 30,
    land_angle_deg: 51,
    carry_yds: 148,
  },
  {
    club: "PW",
    club_speed_mph: 83,
    attack_angle_deg: -5.0,
    ball_speed_mph: 102,
    smash_factor: 1.23,
    launch_angle_deg: 24.2,
    spin_rate_rpm: 9304,
    max_height_yds: 29,
    land_angle_deg: 52,
    carry_yds: 136,
  },
];

const normalizeClubName = (value?: string | null) =>
  (value ?? "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

export const findPgaBenchmark = (clubName?: string | null) => {
  const normalized = normalizeClubName(clubName);
  if (!normalized) return null;
  const direct = PGA_BENCHMARKS.find((entry) =>
    normalized.includes(normalizeClubName(entry.club))
  );
  if (direct) return direct;
  if (normalized.includes("driver")) {
    return PGA_BENCHMARKS.find((entry) => entry.club === "Driver") ?? null;
  }
  if (/(bois|wood)\s*1/.test(normalized) || /1\s*(bois|wood)/.test(normalized)) {
    return PGA_BENCHMARKS.find((entry) => entry.club === "Driver") ?? null;
  }
  if (normalized.includes("pw") || normalized.includes("pitch")) {
    return PGA_BENCHMARKS.find((entry) => entry.club === "PW") ?? null;
  }
  const ironMatch = normalized.match(/([3-9])\s?iron/);
  if (ironMatch) {
    const target = `${ironMatch[1]} Iron`;
    return PGA_BENCHMARKS.find((entry) => entry.club === target) ?? null;
  }
  return null;
};
