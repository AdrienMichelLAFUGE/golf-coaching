import styles from "../landing-illustrations.module.css";

type IllustrationProps = {
  className?: string;
};

export default function SectionAwareAiIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={`${styles.illustration} ${className}`.trim()}
      role="img"
      aria-hidden="true"
    >
      <rect x="22" y="18" width="66" height="84" rx="10" className={styles.outline} />
      <path d="M66 18v18h18" className={styles.outline} />
      <rect
        x="78"
        y="52"
        width="24"
        height="24"
        rx="5"
        className={`${styles.outline} ${styles.fillPanel}`.trim()}
      />
      <path d="M74 56h4" className={styles.outline} />
      <path d="M74 64h4" className={styles.outline} />
      <path d="M74 72h4" className={styles.outline} />
      <path d="M102 56h4" className={styles.outline} />
      <path d="M102 64h4" className={styles.outline} />
      <path d="M102 72h4" className={styles.outline} />
      <path d="M84 48v4" className={styles.outline} />
      <path d="M90 48v4" className={styles.outline} />
      <path d="M96 48v4" className={styles.outline} />
      <path d="M84 76v4" className={styles.outline} />
      <path d="M90 76v4" className={styles.outline} />
      <path d="M96 76v4" className={styles.outline} />
      <circle
        cx="90"
        cy="64"
        r="5"
        className={`${styles.pulse} ${styles.accent1}`.trim()}
        fill="currentColor"
      />
      <path
        d="M66 44 L78 58"
        pathLength={1}
        className={`${styles.outline} ${styles.draw}`.trim()}
      />
      <path
        d="M66 74 L78 66"
        pathLength={1}
        className={`${styles.outline} ${styles.draw} ${styles.drawDelay2}`.trim()}
      />
      <path d="M32 44h28" className={styles.outline} />
      <path d="M32 58h22" className={styles.outline} />
      <path d="M32 72h26" className={styles.outline} />
    </svg>
  );
}
