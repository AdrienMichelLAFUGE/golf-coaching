import * as React from "react";

export type BadgeTone =
  | "muted"
  | "emerald"
  | "sky"
  | "violet"
  | "rose"
  | "amber"
  | "danger";

export type BadgeVariant = "solid" | "dashed";
export type BadgeSize = "sm" | "md";

const TONE_CLASSES: Record<BadgeTone, string> = {
  muted: "border-white/10 bg-white/5 text-[var(--muted)]",
  emerald: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  sky: "border-sky-300/30 bg-sky-400/10 text-sky-100",
  violet: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  rose: "border-rose-300/30 bg-rose-400/10 text-rose-100",
  amber: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  danger: "border-red-400/30 bg-red-500/10 text-red-200",
};

type BadgeProps<TAs extends "span" | "div" = "span"> = {
  children: React.ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  as?: TAs;
};

export default function Badge<TAs extends "span" | "div" = "span">({
  children,
  tone,
  variant = "solid",
  size = "md",
  className,
  as,
}: BadgeProps<TAs>) {
  const Component = (as ?? "span") as "span" | "div";
  const toneClass = tone ? TONE_CLASSES[tone] : null;

  const classes = [
    "app-badge",
    size === "sm" ? "app-badge--sm" : null,
    variant === "dashed" ? "app-badge--dashed" : null,
    // Default look, can be overridden by tone/className.
    "border-white/10 bg-white/5 text-[var(--muted)]",
    toneClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component className={classes}>{children}</Component>;
}

