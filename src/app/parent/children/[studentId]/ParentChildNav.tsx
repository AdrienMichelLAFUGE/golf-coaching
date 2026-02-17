"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { hrefSuffix: "", label: "Dashboard" },
  { hrefSuffix: "/rapports", label: "Rapports" },
  { hrefSuffix: "/tests", label: "Tests" },
  { hrefSuffix: "/calendrier", label: "Calendrier" },
  { hrefSuffix: "/messages", label: "Messages" },
] as const;

export default function ParentChildNav({ studentId }: { studentId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const href = `/parent/children/${studentId}${item.hrefSuffix}`;
        const active =
          item.hrefSuffix === ""
            ? pathname === href
            : pathname === href || pathname?.startsWith(`${href}/`);

        return (
          <Link
            key={item.hrefSuffix || "dashboard"}
            href={href}
            className={`rounded-full border px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] transition ${
              active
                ? "border-white/20 bg-white/10 text-[var(--text)]"
                : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
