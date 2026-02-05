import styles from "../landing-illustrations.module.css";

type IllustrationProps = {
  className?: string;
};

export default function TrainingPlanIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 140 120"
      className={`${styles.illustration} ${className}`.trim()}
      role="img"
      aria-hidden="true"
    >
      <rect x="22" y="20" width="96" height="80" rx="12" className={styles.outline} />
      <path d="M22 36h96" className={styles.outline} />
      <path d="M48 36v64" className={styles.outline} />
      <path d="M74 36v64" className={styles.outline} />
      <path d="M100 36v64" className={styles.outline} />
      <rect
        x="28"
        y="42"
        width="16"
        height="16"
        rx="4"
        className={`${styles.fillCell} ${styles.fillDelay1} ${styles.accent1}`.trim()}
      />
      <rect
        x="54"
        y="42"
        width="16"
        height="16"
        rx="4"
        className={`${styles.fillCell} ${styles.fillDelay2}`.trim()}
      />
      <rect
        x="80"
        y="42"
        width="16"
        height="16"
        rx="4"
        className={`${styles.fillCell} ${styles.fillDelay3}`.trim()}
      />
      <rect
        x="28"
        y="64"
        width="16"
        height="16"
        rx="4"
        className={`${styles.fillCell} ${styles.fillDelay4}`.trim()}
      />
      <rect
        x="54"
        y="64"
        width="16"
        height="16"
        rx="4"
        className={`${styles.fillCell} ${styles.fillDelay5} ${styles.accent2}`.trim()}
      />
      <rect
        x="80"
        y="64"
        width="16"
        height="16"
        rx="4"
        className={`${styles.fillCell} ${styles.fillDelay6}`.trim()}
      />
      <rect
        x="106"
        y="64"
        width="10"
        height="16"
        rx="3"
        className={`${styles.fillCell} ${styles.fillDelay7}`.trim()}
      />
    </svg>
  );
}
