"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "./profile-context";

export default function AppHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const { profile } = useProfile();

  const roleLabel =
    profile?.role === "student" ? "Eleve" : "Coach";

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? null);
    };

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/5 px-6 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Golf Coaching
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)] md:text-3xl">
          Tableau de bord
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-[var(--muted)]">
          {email ?? "Session active"}
        </div>
        {profile ? (
          <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-[var(--muted)]">
            {roleLabel}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:border-white/30 hover:bg-white/20"
        >
          Se deconnecter
        </button>
      </div>
    </header>
  );
}
