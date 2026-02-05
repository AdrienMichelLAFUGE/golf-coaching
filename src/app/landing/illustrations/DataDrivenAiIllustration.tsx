import styles from "../landing-illustrations.module.css";

type IllustrationProps = {
  className?: string;
};

export default function DataDrivenAiIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 140 120"
      className={`${styles.illustration} ${className}`.trim()}
      role="img"
      aria-hidden="true"
    >
      <path d="M20 92h100" className={styles.outline} />
      <path d="M20 92V28" className={styles.outline} />
      <path
        d="M28 80 L50 64 L70 74 L90 52 L112 60"
        pathLength={1}
        className={`${styles.outline} ${styles.draw} ${styles.accent2}`.trim()}
      />
      <rect
        x="104"
        y="64"
        width="16"
        height="16"
        rx="3"
        className={`${styles.outline} ${styles.accent1}`.trim()}
      />
      <path d="M100 68h4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M100 76h4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M120 68h4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M120 76h4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M108 60v4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M116 60v4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M108 80v4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <path d="M116 80v4" className={`${styles.outline} ${styles.accent1}`.trim()} />
      <circle
        cx="112"
        cy="72"
        r="3.5"
        className={`${styles.pulse} ${styles.accent2}`.trim()}
        fill="currentColor"
      />
      <rect
        x="28"
        y="22"
        width="34"
        height="16"
        rx="8"
        className={`${styles.fillSoft} ${styles.badgePulse1} ${styles.accent1}`.trim()}
        fill="currentColor"
      />
      <text x="45" y="33" fontSize="8" textAnchor="middle" fill="currentColor">
        TPI
      </text>
      <rect
        x="80"
        y="22"
        width="46"
        height="16"
        rx="8"
        className={`${styles.fillSoft} ${styles.badgePulse2} ${styles.accent2}`.trim()}
        fill="currentColor"
      />
      <text x="103" y="33" fontSize="8" textAnchor="middle" fill="currentColor">
        Radar
      </text>
    </svg>
  );
}
