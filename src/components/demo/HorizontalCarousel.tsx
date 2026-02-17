"use client";

import {
  Children,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import styles from "./demo.module.css";
import type { SectionId } from "./fixtures";

type HorizontalCarouselProps = {
  sectionId: SectionId;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  children: ReactNode;
  showLocalDots?: boolean;
};

export default function HorizontalCarousel({
  sectionId,
  activeIndex,
  onActiveIndexChange,
  children,
  showLocalDots = true,
}: HorizontalCarouselProps) {
  const slides = useMemo(() => Children.toArray(children), [children]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      return;
    }

    const slideNodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-demo-slide]")
    );
    if (slideNodes.length === 0) return;

    let rafId = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length === 0) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const visibleEntry = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visibleEntry) return;
          const index = Number(
            (visibleEntry.target as HTMLElement).dataset.demoSlideIndex ?? "0"
          );
          if (!Number.isNaN(index)) {
            onActiveIndexChange(index);
          }
        });
      },
      {
        root: container,
        threshold: [0.4, 0.65, 0.85],
      }
    );

    slideNodes.forEach((node) => observer.observe(node));

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [onActiveIndexChange, sectionId]);

  const scrollToSlide = (index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-demo-slide-index="${index}"]`
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className={styles.carousel}
        data-demo-carousel-id={sectionId}
      >
        {slides.map((slide, index) => (
          <div
            key={`${sectionId}-slide-${index}`}
            className={styles.slide}
            data-demo-slide
            data-demo-slide-index={index}
          >
            {slide}
          </div>
        ))}
      </div>
      {showLocalDots && slides.length > 1 ? (
        <div className={styles.localDots} aria-label={`Slides ${sectionId}`}>
          {slides.map((_, index) => (
            <button
              key={`${sectionId}-dot-${index}`}
              type="button"
              className={`${styles.dot} ${activeIndex === index ? styles.dotActive : ""}`}
              onClick={() => scrollToSlide(index)}
              aria-label={`Aller au slide ${index + 1}`}
              aria-current={activeIndex === index}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
