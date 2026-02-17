"use client";

import styles from "./demo.module.css";
import type { SectionId } from "./fixtures";

type ProgressDotsProps = {
  sectionOrder: SectionId[];
  labels: Record<SectionId, string>;
  activeSection: SectionId;
  onSelect: (sectionId: SectionId) => void;
};

function Dots({
  sectionOrder,
  labels,
  activeSection,
  onSelect,
  className,
}: ProgressDotsProps & { className: string }) {
  return (
    <nav className={className} aria-label="Progression démo">
      {sectionOrder.map((sectionId) => {
        const isActive = sectionId === activeSection;
        return (
          <button
            key={`global-dot-${sectionId}`}
            type="button"
            className={`${styles.globalDotButton} ${isActive ? styles.globalDotButtonActive : ""}`}
            onClick={() => onSelect(sectionId)}
            aria-label={labels[sectionId]}
            title={labels[sectionId]}
            aria-current={isActive}
          />
        );
      })}
    </nav>
  );
}

export default function ProgressDots(props: ProgressDotsProps) {
  return (
    <>
      <Dots {...props} className={styles.globalDotsDesktop} />
      <Dots {...props} className={styles.globalDotsMobile} />
    </>
  );
}
