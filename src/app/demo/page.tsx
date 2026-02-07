import Link from "next/link";
import LandingReveal from "../landing/landing-reveal";

export default function DemoPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-28 pt-12 md:px-8 md:pb-36 md:pt-16">
      <LandingReveal />

      <div className="mx-auto max-w-4xl space-y-10">
        <section className="reveal panel-outline rounded-3xl p-8 md:p-10" data-reveal-item>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            SwingFlow
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--text)] md:text-4xl">
            Demo SwingFlow
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Une courte demo arrive bientot. En attendant, vous pouvez acceder a la
            plateforme.
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
            >
              Acceder a la plateforme
            </Link>
          </div>
        </section>

        <section className="reveal panel rounded-3xl p-6 md:p-8" data-reveal-item>
          <div className="aspect-video w-full rounded-2xl border border-white/10 bg-white/5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]" />
          <p className="mt-3 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
            Placeholder video
          </p>
        </section>
      </div>
    </main>
  );
}

