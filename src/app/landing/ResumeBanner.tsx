"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const lastAppPathKey = "gc.lastAppPath";

export default function ResumeBanner() {
  const [resumePath, setResumePath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) return;
      const stored =
        typeof window === "undefined" ? null : window.localStorage.getItem(lastAppPathKey);
      setResumePath(stored && stored.startsWith("/app") ? stored : "/app");
    };

    run();

    return () => {
      active = false;
    };
  }, []);

  if (!resumePath) return null;

  return (
    <div className="reveal panel-outline rounded-3xl px-5 py-4 text-sm" data-reveal-item>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[var(--muted)]">
          Vous etes deja connecte. Reprenez la plateforme la ou vous vous etiez arrete.
        </p>
        <Link
          href={resumePath}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/15 active:scale-[0.98]"
        >
          Reprendre
        </Link>
      </div>
    </div>
  );
}

