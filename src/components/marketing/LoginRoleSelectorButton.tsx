"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TrackedCtaLink from "./TrackedCtaLink";

type LoginRoleSelectorButtonProps = {
  className: string;
  location: string;
  label?: string;
  menuAlign?: "left" | "right";
  menuDirection?: "up" | "down";
};

const loginOptions = [
  {
    id: "coach",
    label: "Coach / Structure",
    description: "Acces au workspace coaching",
    href: "/login/coach?mode=signin",
  },
  {
    id: "student",
    label: "Eleve",
    description: "Connexion eleve",
    href: "/login/eleve",
  },
  {
    id: "parent",
    label: "Parent",
    description: "Suivi parent en lecture seule",
    href: "/login/parent",
  },
] as const;

export default function LoginRoleSelectorButton({
  className,
  location,
  label = "Se connecter",
  menuAlign = "right",
  menuDirection = "down",
}: LoginRoleSelectorButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    direction: "up" | "down";
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    const computeMenuStyle = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 260;
      const gutter = 8;
      const viewportPadding = 8;
      const minVisibleHeight = 140;

      const spaceBelow = viewportHeight - rect.bottom - gutter - viewportPadding;
      const spaceAbove = rect.top - gutter - viewportPadding;

      let direction = menuDirection;
      if (direction === "down" && spaceBelow < minVisibleHeight && spaceAbove > spaceBelow) {
        direction = "up";
      } else if (direction === "up" && spaceAbove < minVisibleHeight && spaceBelow > spaceAbove) {
        direction = "down";
      }

      let left = menuAlign === "left" ? rect.left : rect.right - menuWidth;
      left = Math.max(viewportPadding, Math.min(left, viewportWidth - menuWidth - viewportPadding));

      const top = direction === "down" ? rect.bottom + gutter : rect.top - gutter;
      const maxHeight = Math.max(minVisibleHeight, direction === "down" ? spaceBelow : spaceAbove);

      setMenuStyle({ left, top, maxHeight, direction });
    };

    computeMenuStyle();
    window.addEventListener("resize", computeMenuStyle);
    window.addEventListener("scroll", computeMenuStyle, true);
    return () => {
      window.removeEventListener("resize", computeMenuStyle);
      window.removeEventListener("scroll", computeMenuStyle, true);
    };
  }, [open, menuAlign, menuDirection]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedButton = rootRef.current?.contains(target) ?? false;
      const clickedMenu = menuRef.current?.contains(target) ?? false;
      if (!clickedButton && !clickedMenu) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={className}
      >
        {label}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={
            menuStyle
              ? {
                  position: "fixed",
                  left: `${menuStyle.left}px`,
                  top: `${menuStyle.top}px`,
                  width: "260px",
                  maxHeight: `${menuStyle.maxHeight}px`,
                  transform:
                    menuStyle.direction === "up" ? "translateY(-100%)" : "translateY(0)",
                  zIndex: 120,
                }
              : undefined
          }
          className="overflow-y-auto rounded-2xl border border-white/20 bg-[var(--bg-elevated)]/95 p-2 shadow-[0_18px_42px_rgba(15,23,42,0.26)] backdrop-blur"
        >
          <p className="px-2 pb-2 pt-1 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted)]">
            Je me connecte en tant que
          </p>
          <div className="space-y-1">
            {loginOptions.map((option) => (
              <TrackedCtaLink
                key={option.id}
                href={option.href}
                role="menuitem"
                tracking={{
                  id: `${location}_signin_${option.id}`,
                  location,
                  target: option.href,
                }}
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/10"
              >
                <span className="block text-sm font-semibold text-[var(--text)]">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {option.description}
                </span>
              </TrackedCtaLink>
            ))}
          </div>
        </div>
        , document.body)
        : null}
    </div>
  );
}
