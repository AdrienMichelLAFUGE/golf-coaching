import type { CSSProperties, ReactElement } from "react";

import styles from "./hero-orbit-visual.module.css";

type Size = "sm" | "md" | "lg";

type IconComponent = (props: { className?: string }) => ReactElement;

type OrbitItem = {
  key: string;
  label: string;
  angleDeg: number;
  orbit: "inner" | "outer";
  variant?: "hero" | "normal";
  floatDelaySec: number;
  floatDurationSec: number;
  Icon: IconComponent;
};

const IconUsers = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 11.8a3.2 3.2 0 1 0-2.9-5.2" />
    <circle cx="10" cy="10" r="3.2" />
    <path d="M4.6 20c1.1-3 4.1-4.8 7.4-4.8S18.3 17 19.4 20" />
    <path d="M17.6 15.8c1.7.5 3 1.8 3.6 4.2" />
  </svg>
);

const IconBarChart3 = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-8" />
    <path d="M22 20V8" />
  </svg>
);

const IconFileText = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 3.5h6.5L19.5 9v11A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
    <path d="M13.5 3.5V9H19" />
    <path d="M8.5 12h7" />
    <path d="M8.5 15.5h7" />
  </svg>
);

const IconTestTube2 = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 3.5h8" />
    <path d="M10 3.5v6.2l-4.6 8a3.8 3.8 0 0 0 3.3 5.8h6.6a3.8 3.8 0 0 0 3.3-5.8l-4.6-8V3.5" />
    <path d="M8.7 16.2h6.6" />
  </svg>
);

const IconVideo = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4.5" y="7" width="11.5" height="10" rx="2" />
    <path d="M16 10.2l4-2.2v8l-4-2.2" />
  </svg>
);

const IconClipboardList = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 4.5h6" />
    <path d="M9 3.5h6a2 2 0 0 1 2 2V20a1.5 1.5 0 0 1-1.5 1.5H8.5A1.5 1.5 0 0 1 7 20V5.5a2 2 0 0 1 2-2Z" />
    <path d="M9 10h7" />
    <path d="M9 13.5h7" />
    <path d="M9 17h5" />
  </svg>
);

const SIZE_PRESETS: Record<
  Size,
  {
    container: { maxWidth: number; height: number };
    ringInner: number;
    ringOuter: number;
    radiusInner: number;
    radiusOuter: number;
    pill: number;
    heroPill: number;
    core: number;
    orbitInnerDurationSec: number;
    orbitOuterDurationSec: number;
  }
> = {
  sm: {
    container: { maxWidth: 440, height: 340 },
    ringInner: 280,
    ringOuter: 340,
    radiusInner: 132,
    radiusOuter: 162,
    pill: 48,
    heroPill: 60,
    core: 160,
    orbitInnerDurationSec: 16,
    orbitOuterDurationSec: 20,
  },
  md: {
    container: { maxWidth: 560, height: 440 },
    ringInner: 320,
    ringOuter: 400,
    radiusInner: 152,
    radiusOuter: 190,
    pill: 52,
    heroPill: 64,
    core: 184,
    orbitInnerDurationSec: 16,
    orbitOuterDurationSec: 20,
  },
  lg: {
    container: { maxWidth: 560, height: 460 },
    ringInner: 340,
    ringOuter: 420,
    radiusInner: 162,
    radiusOuter: 200,
    pill: 54,
    heroPill: 68,
    core: 196,
    orbitInnerDurationSec: 18,
    orbitOuterDurationSec: 22,
  },
};

const buildItems = (): OrbitItem[] => [
  {
    key: "reports",
    label: "Rapports",
    angleDeg: -18,
    orbit: "outer",
    variant: "hero",
    floatDelaySec: 0.2,
    floatDurationSec: 5.6,
    Icon: IconFileText,
  },
  {
    key: "users",
    label: "Eleves",
    angleDeg: 42,
    orbit: "inner",
    floatDelaySec: 0.9,
    floatDurationSec: 6.1,
    Icon: IconUsers,
  },
  {
    key: "charts",
    label: "Data",
    angleDeg: 102,
    orbit: "outer",
    floatDelaySec: 0.4,
    floatDurationSec: 5.0,
    Icon: IconBarChart3,
  },
  {
    key: "checklists",
    label: "Suivi",
    angleDeg: 162,
    orbit: "inner",
    floatDelaySec: 1.15,
    floatDurationSec: 6.4,
    Icon: IconClipboardList,
  },
  {
    key: "video",
    label: "Video",
    angleDeg: 222,
    orbit: "outer",
    floatDelaySec: 0.55,
    floatDurationSec: 5.7,
    Icon: IconVideo,
  },
  {
    key: "tests",
    label: "Tests",
    angleDeg: 282,
    orbit: "inner",
    floatDelaySec: 1.35,
    floatDurationSec: 5.2,
    Icon: IconTestTube2,
  },
];

export default function HeroOrbitVisual({
  size = "md",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const preset = SIZE_PRESETS[size];
  const items = buildItems();
  const outerItems = items.filter((item) => item.orbit === "outer");
  const innerItems = items.filter((item) => item.orbit === "inner");
  const iconClassName = size === "lg" ? "h-6 w-6" : "h-5 w-5";

  const containerStyle: CSSProperties = {
    width: "100%",
    maxWidth: `${preset.container.maxWidth}px`,
    height: `${preset.container.height}px`,
  };

  const ringInnerStyle: CSSProperties = {
    width: `${preset.ringInner}px`,
    height: `${preset.ringInner}px`,
  };

  const ringOuterStyle: CSSProperties = {
    width: `${preset.ringOuter}px`,
    height: `${preset.ringOuter}px`,
  };

  const orbitOuterStyle: CSSProperties = {
    width: `${preset.ringOuter}px`,
    height: `${preset.ringOuter}px`,
    ["--orbitDuration" as string]: `${preset.orbitOuterDurationSec}s`,
  };

  const orbitInnerStyle: CSSProperties = {
    width: `${preset.ringInner}px`,
    height: `${preset.ringInner}px`,
    ["--orbitDuration" as string]: `${preset.orbitInnerDurationSec}s`,
  };

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      style={containerStyle}
      aria-hidden="true"
    >
      <div className={styles.halo} />
      <div className={styles.blob} />
      <div className={styles.mesh} />

      <div className={styles.ringOuter} style={ringOuterStyle} />
      <div className={styles.ring} style={ringInnerStyle} />

      <div className={[styles.orbitGroup, styles.orbitSpokes].join(" ")} style={orbitOuterStyle}>
        {outerItems.map((item) => {
          const angle = `${item.angleDeg}deg`;
          const pillSize = item.variant === "hero" ? preset.heroPill : preset.pill;
          const radius = preset.radiusOuter;
          const lineLength = Math.max(90, radius - pillSize / 2 - 10);
          const vars: CSSProperties = {
            ["--angle" as string]: angle,
            ["--radius" as string]: `${radius}px`,
            ["--lineLength" as string]: `${lineLength}px`,
            ["--pillSize" as string]: `${pillSize}px`,
            ["--floatDelay" as string]: `${item.floatDelaySec}s`,
            ["--floatDuration" as string]: `${item.floatDurationSec}s`,
          };

          return <div key={`${item.key}-spoke`} className={styles.spoke} style={vars} />;
        })}
      </div>

      <div
        className={[styles.orbitGroup, styles.orbitSpokes, styles.orbitReverse].join(" ")}
        style={orbitInnerStyle}
      >
        {innerItems.map((item) => {
          const angle = `${item.angleDeg}deg`;
          const pillSize = item.variant === "hero" ? preset.heroPill : preset.pill;
          const radius = preset.radiusInner;
          const lineLength = Math.max(78, radius - pillSize / 2 - 10);
          const vars: CSSProperties = {
            ["--angle" as string]: angle,
            ["--radius" as string]: `${radius}px`,
            ["--lineLength" as string]: `${lineLength}px`,
            ["--pillSize" as string]: `${pillSize}px`,
            ["--floatDelay" as string]: `${item.floatDelaySec}s`,
            ["--floatDuration" as string]: `${item.floatDurationSec}s`,
          };

          return <div key={`${item.key}-spoke`} className={styles.spoke} style={vars} />;
        })}
      </div>

      <div className={styles.core} style={{ ["--coreSize" as string]: `${preset.core}px` }}>
        <div className={styles.coreBadge} aria-hidden="true">
          S
        </div>
        <div className={styles.coreText} aria-hidden="true">
          <div className={styles.coreTitle}>SwingFlow</div>
          <div className={styles.coreSubtitle}>Eleves | Data | Rapports</div>
        </div>
        <div className={styles.corePills} aria-hidden="true">
          <span className={styles.corePill} />
          <span className={styles.corePill} />
          <span className={styles.corePill} />
        </div>
      </div>

      <div className={[styles.orbitGroup, styles.orbitNodes].join(" ")} style={orbitOuterStyle}>
        {outerItems.map((item) => {
          const angle = `${item.angleDeg}deg`;
          const angleNeg = `${-item.angleDeg}deg`;
          const pillSize = item.variant === "hero" ? preset.heroPill : preset.pill;
          const vars: CSSProperties = {
            ["--angle" as string]: angle,
            ["--angleNeg" as string]: angleNeg,
            ["--radius" as string]: `${preset.radiusOuter}px`,
            ["--pillSize" as string]: `${pillSize}px`,
            ["--floatDelay" as string]: `${item.floatDelaySec}s`,
            ["--floatDuration" as string]: `${item.floatDurationSec}s`,
          };

          const isHero = item.variant === "hero";
          const pillClassName = isHero ? `${styles.pill} ${styles.pillHero}` : styles.pill;

          return (
            <div key={item.key} className={styles.center}>
              <div className={styles.positioner} style={vars}>
                <div className={styles.counterRotate}>
                  <div className={styles.float} style={vars}>
                    <div className={pillClassName} style={vars} title={item.label}>
                      <item.Icon className={iconClassName} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={[styles.orbitGroup, styles.orbitNodes, styles.orbitReverse].join(" ")}
        style={orbitInnerStyle}
      >
        {innerItems.map((item) => {
          const angle = `${item.angleDeg}deg`;
          const angleNeg = `${-item.angleDeg}deg`;
          const pillSize = item.variant === "hero" ? preset.heroPill : preset.pill;
          const vars: CSSProperties = {
            ["--angle" as string]: angle,
            ["--angleNeg" as string]: angleNeg,
            ["--radius" as string]: `${preset.radiusInner}px`,
            ["--pillSize" as string]: `${pillSize}px`,
            ["--floatDelay" as string]: `${item.floatDelaySec}s`,
            ["--floatDuration" as string]: `${item.floatDurationSec}s`,
          };

          const isHero = item.variant === "hero";
          const pillClassName = isHero ? `${styles.pill} ${styles.pillHero}` : styles.pill;

          return (
            <div key={item.key} className={styles.center}>
              <div className={styles.positioner} style={vars}>
                <div className={styles.counterRotate}>
                  <div className={styles.float} style={vars}>
                    <div className={pillClassName} style={vars} title={item.label}>
                      <item.Icon className={iconClassName} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
