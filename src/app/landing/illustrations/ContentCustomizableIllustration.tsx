import styles from "../landing-illustrations.module.css";

type IllustrationProps = {
  className?: string;
};

export default function ContentCustomizableIllustration({
  className = "",
}: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={`${styles.illustration} ${className}`.trim()}
      role="img"
      aria-hidden="true"
    >
      <rect x="24" y="16" width="72" height="88" rx="10" className={styles.outline} />
      <path d="M72 16v20h20" className={styles.outline} />
      <g className={styles.moduleA}>
        <rect
          x="34"
          y="36"
          width="52"
          height="14"
          rx="6"
          className={`${styles.outline} ${styles.fillSoft}`.trim()}
        />
      </g>
      <g className={styles.moduleB}>
        <rect
          x="34"
          y="56"
          width="52"
          height="14"
          rx="6"
          className={`${styles.outline} ${styles.fillSoft}`.trim()}
        />
      </g>
      <g className={styles.moduleC}>
        <rect
          x="34"
          y="76"
          width="52"
          height="14"
          rx="6"
          className={`${styles.outline} ${styles.fillSoft}`.trim()}
        />
      </g>
      <g className={styles.moduleD}>
        <rect
          x="34"
          y="94"
          width="36"
          height="10"
          rx="5"
          className={`${styles.outline} ${styles.fillSoft}`.trim()}
        />
      </g>
      <circle
        cx="84"
        cy="52"
        r="4"
        className={`${styles.swapDot} ${styles.accent1}`.trim()}
        fill="currentColor"
      />
    </svg>
  );
}
