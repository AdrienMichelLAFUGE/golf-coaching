"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "./profile-context";

type NavItem = {
  label: string;
  href: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export default function AppNav() {
  const pathname = usePathname();
  const { profile, loading } = useProfile();

  const sections: NavSection[] = [
    {
      title: "General",
      items: [{ label: "Accueil", href: "/app" }],
    },
  ];

  if (!loading) {
    if (profile?.role === "student") {
      sections.push({
        title: "Eleve",
        items: [
          { label: "Dashboard eleve", href: "/app/eleve" },
          { label: "Rapports", href: "/app/eleve/rapports" },
        ],
      });
    } else {
      sections.push({
        title: "Coach",
        items: [
          { label: "Dashboard coach", href: "/app/coach" },
          { label: "Eleves", href: "/app/coach/eleves" },
          { label: "Rapports", href: "/app/coach/rapports" },
          { label: "Nouveau rapport", href: "/app/coach/rapports/nouveau" },
        ],
      });
    }
  }

  const isActive = (href: string) => {
    if (href === "/app") {
      return pathname === "/app";
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  return (
    <aside className="panel-soft rounded-2xl px-4 py-5">
      <nav className="space-y-6 text-sm">
        {loading ? (
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Chargement du profil...
          </p>
        ) : null}
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {section.title}
            </p>
            <div className="space-y-2">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 transition ${
                      active
                        ? "border-white/30 bg-white/10 text-[var(--text)] shadow-[0_12px_25px_rgba(0,0,0,0.35)]"
                        : "border-white/5 bg-white/5 text-[var(--muted)] hover:border-white/20 hover:bg-white/10 hover:text-[var(--text)]"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs text-[var(--muted)]">-&gt;</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
