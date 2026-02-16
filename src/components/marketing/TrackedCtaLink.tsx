"use client";

import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";
import { trackCtaClick, type CtaClickPayload } from "@/lib/marketing/tracking";

type LinkProps = ComponentProps<typeof Link>;

type TrackedCtaLinkProps = Omit<LinkProps, "onClick"> & {
  tracking: CtaClickPayload;
  onClick?: LinkProps["onClick"];
};

export default function TrackedCtaLink({
  tracking,
  onClick,
  href,
  ...props
}: TrackedCtaLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    trackCtaClick({
      ...tracking,
      target: tracking.target ?? (typeof href === "string" ? href : undefined),
    });
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
