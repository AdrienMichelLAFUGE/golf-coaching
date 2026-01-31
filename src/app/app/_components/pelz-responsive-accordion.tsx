"use client";

import { useState, type ReactNode } from "react";

type AccordionItem = {
  id: string;
  label: string;
  content: ReactNode;
};

type PelzResponsiveAccordionProps = {
  mobileItems: AccordionItem[];
  desktopContent?: ReactNode;
  defaultOpenId?: string | null;
};

export default function PelzResponsiveAccordion({
  mobileItems,
  desktopContent,
  defaultOpenId = null,
}: PelzResponsiveAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(
    defaultOpenId ?? mobileItems[0]?.id ?? null
  );

  return (
    <>
      <div className="space-y-3 md:hidden" data-testid="pelz-mobile-accordion">
        {mobileItems.map((item, index) => {
          const isOpen = item.id === openId;
          const baseId = `pelz-accordion-${index}`;
          const buttonId = `${baseId}-button`;
          const panelId = `${baseId}-panel`;
          return (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-[var(--text)]"
              >
                <span className="font-semibold">{item.label}</span>
                <span
                  className={`text-xs uppercase tracking-[0.2em] text-[var(--muted)] transition ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  v
                </span>
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className={isOpen ? "px-4 pb-4" : "hidden"}
              >
                {item.content}
              </div>
            </div>
          );
        })}
      </div>

      {desktopContent ? (
        <div className="hidden space-y-6 md:block" data-testid="pelz-desktop-layout">
          {desktopContent}
        </div>
      ) : null}
    </>
  );
}
