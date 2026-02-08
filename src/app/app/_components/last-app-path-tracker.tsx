"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const storageKey = "gc.lastAppPath";

export default function LastAppPathTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname?.startsWith("/app")) return;
    const query = searchParams?.toString() ?? "";
    const path = query ? `${pathname}?${query}` : pathname;
    window.localStorage.setItem(storageKey, path);
  }, [pathname, searchParams]);

  return null;
}

