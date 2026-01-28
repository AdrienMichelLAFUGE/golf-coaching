type ShotRecord = Record<string, unknown>;

export type SegmentSummary = {
  key: string;
  count: number;
  carry_mean?: number | null;
  carry_std?: number | null;
  total_mean?: number | null;
  total_std?: number | null;
  lateral_mean?: number | null;
  lateral_std?: number | null;
  smash_mean?: number | null;
  rpm_mean?: number | null;
  launch_v_mean?: number | null;
  ftp_mean?: number | null;
  path_mean?: number | null;
  withinLat10?: number | null;
  withinDist10?: number | null;
};

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

const std = (values: number[]) => {
  if (!values.length) return null;
  const avg = mean(values) ?? 0;
  const variance =
    values.reduce((acc, val) => acc + (val - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const pickNumbers = (shots: ShotRecord[], key: string) =>
  shots
    .map((shot) => shot[key])
    .filter((value): value is number => typeof value === "number");

export const buildSegments = (
  shots: ShotRecord[],
  {
    latThreshold = 10,
    distThreshold = 10,
  }: { latThreshold?: number; distThreshold?: number } = {}
) => {
  const segment = (key: string, selector: (shot: ShotRecord) => string | null) => {
    const buckets = new Map<string, ShotRecord[]>();
    shots.forEach((shot) => {
      const bucket = selector(shot);
      if (!bucket) return;
      const list = buckets.get(bucket) ?? [];
      list.push(shot);
      buckets.set(bucket, list);
    });

    const summaries: SegmentSummary[] = [];
    buckets.forEach((bucketShots, bucketKey) => {
      const carryValues = pickNumbers(bucketShots, "carry");
      const totalValues = pickNumbers(bucketShots, "total");
      const lateralValues = pickNumbers(bucketShots, "lateral");
      const smashValues = pickNumbers(bucketShots, "smash");
      const rpmValues = pickNumbers(bucketShots, "spin_rpm");
      const launchVValues = pickNumbers(bucketShots, "launch_v");
      const ftpValues = pickNumbers(bucketShots, "ftp");
      const pathValues = pickNumbers(bucketShots, "path");
      const withinLat = lateralValues.length
        ? lateralValues.filter((val) => Math.abs(val) <= latThreshold).length /
          lateralValues.length
        : null;
      const distValues = pickNumbers(bucketShots, "distance_from_target");
      const withinDist = distValues.length
        ? distValues.filter((val) => Math.abs(val) <= distThreshold).length /
          distValues.length
        : null;

      summaries.push({
        key: bucketKey,
        count: bucketShots.length,
        carry_mean: mean(carryValues),
        carry_std: std(carryValues),
        total_mean: mean(totalValues),
        total_std: std(totalValues),
        lateral_mean: mean(lateralValues),
        lateral_std: std(lateralValues),
        smash_mean: mean(smashValues),
        rpm_mean: mean(rpmValues),
        launch_v_mean: mean(launchVValues),
        ftp_mean: mean(ftpValues),
        path_mean: mean(pathValues),
        withinLat10: withinLat !== null ? Number((withinLat * 100).toFixed(1)) : null,
        withinDist10:
          withinDist !== null ? Number((withinDist * 100).toFixed(1)) : null,
      });
    });

    return { key, summaries };
  };

  return {
    byShotType: segment("byShotType", (shot) =>
      typeof shot.shot_type === "string" && shot.shot_type.trim()
        ? shot.shot_type
        : null
    ),
    byLeftRight: segment("byLeftRight", (shot) =>
      typeof shot.left_right === "string" ? shot.left_right : null
    ),
    bySmashBin: segment("bySmashBin", (shot) =>
      typeof shot.smash_bin === "string" ? shot.smash_bin : null
    ),
    byImpactZone: segment("byImpactZone", (shot) =>
      typeof shot.impact_zone === "string" ? shot.impact_zone : null
    ),
    byAbsFtpQuantile: segment("byAbsFtpQuantile", (shot) =>
      typeof shot.abs_ftp_bin === "string" ? shot.abs_ftp_bin : null
    ),
    byLaunchVBin: segment("byLaunchVBin", (shot) =>
      typeof shot.launch_v_bin === "string" ? shot.launch_v_bin : null
    ),
    byPeriodTertile: segment("byPeriodTertile", (shot) =>
      typeof shot.period_tertile === "string" ? shot.period_tertile : null
    ),
  };
};

