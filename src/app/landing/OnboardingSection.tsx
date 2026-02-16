import Link from "next/link";

const onboardingSteps = [
  {
    title: "Créer ton compte coach",
    description:
      "Inscris-toi en mode coach pour accéder à ton espace personnel.",
  },
  {
    title: "Ajouter ton premier élève",
    description:
      "Crée une fiche élève et centralise ses infos en un seul endroit.",
  },
  {
    title: "Publier un premier rapport",
    description:
      "Importe les données, rédige avec l'IA, puis partage le rapport.",
  },
] as const;

export default function OnboardingSection() {
  return (
    <section
      className="reveal panel-soft rounded-3xl p-8 md:p-10 lg:max-w-[92%]"
      data-reveal-stagger
    >
      <div data-reveal-item>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Onboarding
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)] md:text-3xl">
          Démarrage guidé en 3 étapes
        </h2>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Objectif : obtenir un premier résultat concret rapidement, sans complexité.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {onboardingSteps.map((step, index) => (
          <article
            key={step.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
            data-reveal-item
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Étape {index + 1}
            </p>
            <h3 className="mt-2 text-base font-semibold text-[var(--text)]">{step.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">{step.description}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3" data-reveal-item>
        <Link
          href="/login?mode=signup"
          className="inline-flex rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
        >
          Créer mon compte coach
        </Link>
        <Link
          href="/login?mode=signin"
          className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 active:scale-[0.98]"
        >
          J&apos;ai déjà un compte
        </Link>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]" data-reveal-item>
        Les comptes élèves sont créés via invitation coach.
      </p>
    </section>
  );
}
