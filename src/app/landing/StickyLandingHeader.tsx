"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import TrackedCtaLink from "@/components/marketing/TrackedCtaLink";

const anchorLinks = [
  { id: "fonctionnalites", label: "Fonctionnalités", href: "#fonctionnalites" },
  { id: "pricing", label: "Tarifs", href: "#pricing" },
  { id: "faq", label: "FAQ", href: "#faq" },
] as const;

export default function StickyLandingHeader() {
  const [pressedId, setPressedId] = useState<string | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleAnchorClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    id: string
  ) => {
    if (!href.startsWith("#")) return;

    event.preventDefault();
    setPressedId(id);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setPressedId((current) => (current === id ? null : current));
    }, 260);

    const target = document.querySelector<HTMLElement>(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", href);
    }
  };

  return (
    <div className="reveal sticky top-4 z-30" data-reveal-item>
      <nav
        aria-label="Navigation landing"
        className="rounded-full border border-white/20 bg-white/75 px-3 py-2 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur"
      >
        <div className="flex gap-2 overflow-x-auto">
          {anchorLinks.map((link) => (
            <TrackedCtaLink
              key={link.id}
              href={link.href}
              onClick={(event) => handleAnchorClick(event, link.href, link.id)}
              tracking={{
                id: `landing_anchor_${link.id}`,
                location: "sticky_header",
                target: link.href,
              }}
              className={`relative rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-all duration-200 active:scale-95 ${
                pressedId === link.id
                  ? "border-slate-900 bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)]"
                  : "border-transparent bg-white/60 text-slate-700 hover:border-white/30 hover:bg-white hover:text-slate-900"
              }`}
            >
              {link.label}
              {pressedId === link.id ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full border border-slate-900/30 animate-ping"
                />
              ) : null}
            </TrackedCtaLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
