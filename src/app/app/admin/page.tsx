"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../_components/admin-guard";
import PageBack from "../_components/page-back";

type OverviewPayload = {
  orgsCount: number;
  coachesCount: number;
  studentsCount: number;
  aiRequests30d: number;
};

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true);
      setError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError("Session invalide. Reconnecte toi.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as OverviewPayload & {
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 423) {
          setLoading(false);
          return;
        }
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      setOverview(payload);
      setLoading(false);
    };

    void loadOverview();

    const handleBackofficeUnlocked = () => {
      void loadOverview();
    };
    window.addEventListener("backoffice:unlocked", handleBackofficeUnlocked);

    return () => {
      window.removeEventListener("backoffice:unlocked", handleBackofficeUnlocked);
    };
  }, []);

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Admin
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Backoffice central
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Pilote les prix, les acces coach, et le suivi IA.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            {
              label: "Organisations",
              value: !loading && overview ? `${overview.orgsCount}` : "-",
            },
            {
              label: "Coachs",
              value: !loading && overview ? `${overview.coachesCount}` : "-",
            },
            {
              label: "Eleves",
              value: !loading && overview ? `${overview.studentsCount}` : "-",
            },
            {
              label: "IA 30 jours",
              value: !loading && overview ? `${overview.aiRequests30d}` : "-",
            },
          ].map((item) => (
            <div key={item.label} className="panel-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text)]">
                {item.value}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">Donnees internes</p>
            </div>
          ))}
        </section>

        {error ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-red-400">{error}</p>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-5">
          {[
            {
              title: "Tarifs & features",
              description: "Modifie les prix et les listes de features visibles.",
              href: "/app/admin/pricing",
              cta: "Ouvrir les tarifs",
            },
            {
              title: "Acces coach",
              description: "Active ou coupe le premium et choisis le modele IA.",
              href: "/app/admin/coaches",
              cta: "Gerer les coachs",
            },
            {
              title: "Analytics IA",
              description: "Suivi des appels IA, tokens et activite par coach.",
              href: "/app/admin/analytics",
              cta: "Voir les analytics",
            },
            {
              title: "Bugs utilisateurs",
              description: "Centralise les incidents remontes depuis le produit.",
              href: "/app/admin/bugs",
              cta: "Voir les bugs",
            },
            {
              title: "Logs applicatifs",
              description: "Monitor les actions clefs des coachs et du systeme.",
              href: "/app/admin/logs",
              cta: "Voir les logs",
            },
          ].map((card) => (
            <div key={card.title} className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">{card.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{card.description}</p>
              <Link
                href={card.href}
                className="mt-4 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              >
                {card.cta}
              </Link>
            </div>
          ))}
        </section>
      </div>
    </AdminGuard>
  );
}
