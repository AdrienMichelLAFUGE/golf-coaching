"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { waitForRecoveredSession } from "@/lib/auth/session-recovery";
import { ProfileProvider } from "./profile-context";

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const currentPath =
      typeof window === "undefined"
        ? "/app"
        : `${window.location.pathname}${window.location.search}`;
    const safeNextPath =
      currentPath && currentPath.startsWith("/app") ? currentPath : "/app";
    const loginHref = `/login?next=${encodeURIComponent(safeNextPath)}`;

    if (typeof window !== "undefined" && safeNextPath.startsWith("/app")) {
      window.localStorage.setItem("gc.lastAppPath", safeNextPath);
    }

    const checkSession = async () => {
      const session = await waitForRecoveredSession(supabase.auth, {
        timeoutMs: 1400,
      });
      if (!active) return;
      if (!session) {
        router.replace(loginHref);
        return;
      }
      setChecking(false);
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[1.5px]" />
        <div className="relative rounded-full border border-white/15 bg-[var(--bg-elevated)]/80 px-5 py-2 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
          Verification de la session...
        </div>
      </div>
    );
  }

  return <ProfileProvider>{children}</ProfileProvider>;
}
