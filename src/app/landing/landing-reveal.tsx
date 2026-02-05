"use client";

import { useEffect } from "react";

export default function LandingReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousTheme = root.getAttribute("data-theme");
    root.classList.add("landing-snap");
    body.classList.add("landing-snap");
    root.setAttribute("data-theme", "light");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal")
    );

    const applyStagger = (section: HTMLElement) => {
      if (!section.hasAttribute("data-reveal-stagger")) return;
      const items = Array.from(
        section.querySelectorAll<HTMLElement>("[data-reveal-item]")
      ).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const shouldStagger = !prefersReducedMotion && items.length <= 6;
      items.forEach((item, index) => {
        item.style.transitionDelay = shouldStagger ? `${index * 90}ms` : "0ms";
      });
    };

    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return () => {
        root.classList.remove("landing-snap");
        body.classList.remove("landing-snap");
        if (previousTheme === null) {
          root.removeAttribute("data-theme");
        } else {
          root.setAttribute("data-theme", previousTheme);
        }
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            applyStagger(entry.target as HTMLElement);
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      root.classList.remove("landing-snap");
      body.classList.remove("landing-snap");
      if (previousTheme === null) {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", previousTheme);
      }
    };
  }, []);

  return null;
}
