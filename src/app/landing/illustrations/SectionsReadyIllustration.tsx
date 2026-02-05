import styles from "../landing-illustrations.module.css";

type IllustrationProps = {
  className?: string;
};

export default function SectionsReadyIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={`${styles.illustration} ${className}`.trim()}
      role="img"
      aria-hidden="true"
    >
      <rect x="26" y="16" width="68" height="88" rx="10" className={styles.outline} />
      <path d="M72 16v20h20" className={styles.outline} />
      <path
        d="M36 48h48"
        pathLength={1}
        className={`${styles.outline} ${styles.draw}`.trim()}
      />
      <path
        d="M36 58h42"
        pathLength={1}
        className={`${styles.outline} ${styles.draw} ${styles.drawDelay1}`.trim()}
      />
      <path
        d="M36 68h46"
        pathLength={1}
        className={`${styles.outline} ${styles.draw} ${styles.drawDelay2}`.trim()}
      />
      <path
        d="M36 78h38"
        pathLength={1}
        className={`${styles.outline} ${styles.draw} ${styles.drawDelay3}`.trim()}
      />
      <rect
        x="34"
        y="44"
        width="10"
        height="2.4"
        rx="1.2"
        className={`${styles.cursor} ${styles.accent1}`.trim()}
        fill="currentColor"
      />
    </svg>
  );
}
