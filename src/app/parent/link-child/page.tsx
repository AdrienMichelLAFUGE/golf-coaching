"use client";

import Link from "next/link";

export default function ParentLinkChildPage() {
  return (
    <section className="panel mx-auto w-full max-w-2xl rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
        Rattachement
      </p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
        Rattachement securise V2
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Le formulaire manuel est desactive. Utilise un lien d invitation parent et le code
        secret eleve pour finaliser le rattachement.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href="/parent/invitations/accept"
          className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20"
        >
          Accepter une invitation
        </Link>
        <Link
          href="/parent"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </Link>
      </div>
    </section>
  );
}
