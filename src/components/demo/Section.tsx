import { forwardRef, type ReactNode } from "react";
import styles from "./demo.module.css";

type SectionProps = {
  id: string;
  sectionLabel: string;
  children: ReactNode;
};

const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { id, sectionLabel, children },
  ref
) {
  return (
    <section
      ref={ref}
      id={id}
      data-demo-section-id={id}
      className={styles.section}
      aria-label={sectionLabel}
    >
      <div className={styles.sectionPanel}>{children}</div>
    </section>
  );
});

export default Section;
