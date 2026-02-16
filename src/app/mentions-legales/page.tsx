import Link from "next/link";
import LandingReveal from "../landing/landing-reveal";

export default function MentionsLegalesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16 text-[var(--text)]">
      <LandingReveal />

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">SwingFlow</p>
        <h1 className="text-3xl font-semibold">Mentions légales</h1>
        <p className="text-sm text-[var(--muted)]">
          Informations relatives à l&apos;éditeur du site et à l&apos;hébergement.
        </p>
      </header>

      <article className="panel-outline rounded-3xl px-6 py-6 text-sm text-[var(--muted)]">
        <div className="space-y-8 leading-relaxed">
          <p>
            Conformément aux dispositions de l&apos;article 6 III-1 de la loi n°2004-575 du
            21 juin 2004 pour la confiance dans l&apos;économie numérique (LCEN), il est
            précisé aux utilisateurs du site l&apos;identité des différents intervenants.
          </p>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">Éditeur du site</h2>
            <dl className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <dt className="text-[var(--text)]/80">Nom</dt>
              <dd>LAFUGE ADRIEN</dd>

              <dt className="text-[var(--text)]/80">Statut</dt>
              <dd>Entreprise Individuelle</dd>

              <dt className="text-[var(--text)]/80">Nom commercial</dt>
              <dd>EI LAFUGE ADRIEN</dd>

              <dt className="text-[var(--text)]/80">Adresse</dt>
              <dd>Domaine de la Plaine, 45240 Marcilly-en-Villette, France</dd>

              <dt className="text-[var(--text)]/80">Email</dt>
              <dd>
                <a className="underline underline-offset-4" href="mailto:contact@swingflow.fr">
                  contact@swingflow.fr
                </a>
              </dd>

              <dt className="text-[var(--text)]/80">SIREN</dt>
              <dd>894 371 624</dd>

              <dt className="text-[var(--text)]/80">TVA intracommunautaire</dt>
              <dd>Non applicable</dd>

              <dt className="text-[var(--text)]/80">Directeur de la publication</dt>
              <dd>Adrien Lafuge</dd>
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">Hébergement</h2>
            <dl className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <dt className="text-[var(--text)]/80">Hébergeur</dt>
              <dd>Vercel Inc.</dd>

              <dt className="text-[var(--text)]/80">Adresse</dt>
              <dd>340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</dd>

              <dt className="text-[var(--text)]/80">Site web</dt>
              <dd>
                <a
                  className="underline underline-offset-4"
                  href="https://vercel.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  vercel.com
                </a>
              </dd>
            </dl>
          </section>
        </div>
      </article>

      <div>
        <Link
          href="/landing"
          className="text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour à la landing
        </Link>
      </div>
    </main>
  );
}
