import Link from "next/link";
import LandingReveal from "../landing/landing-reveal";

const resolveReturnTo = (value?: string | string[] | null) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/landing";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/landing";
  if (raw.includes("\\")) return "/landing";
  return raw;
};

export default async function CgvPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const returnTo = resolveReturnTo(resolvedSearchParams?.returnTo ?? null);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16 text-[var(--text)]">
      <LandingReveal />

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">SwingFlow</p>
        <h1 className="text-3xl font-semibold">CGV</h1>
        <p className="text-sm text-[var(--muted)]">Conditions générales de vente.</p>
      </header>

      <article className="panel-outline rounded-3xl px-6 py-6 text-sm text-[var(--muted)]">
        <div className="space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Conditions générales de vente (CGV)
            </h2>
            <p>
              Les présentes Conditions générales de vente régissent les modalités de
              souscription et d&apos;utilisation du service SaaS proposé par{" "}
              <strong className="text-[var(--text)]">EI LAFUGE ADRIEN</strong>, entreprise
              individuelle immatriculée sous le numéro SIREN 894 371 624, dont le siège
              social est situé Domaine de la Plaine, 45240 Marcilly-en-Villette, France.
            </p>
            <p>Le service est exclusivement destiné à des professionnels (B2B).</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">1. Description du service</h3>
            <p>
              Le service consiste en une plateforme en ligne de centralisation et de
              gestion destinée aux coachs de golf et aux structures professionnelles,
              accessible via un compte utilisateur.
            </p>
            <p>
              Une offre gratuite (« freemium ») peut être proposée avec des
              fonctionnalités limitées.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">2. Accès au service</h3>
            <p>
              L&apos;accès au service nécessite la création d&apos;un compte utilisateur.
              L&apos;utilisateur s&apos;engage à fournir des informations exactes et à jour.
            </p>
            <p>
              L&apos;éditeur se réserve le droit de suspendre ou supprimer un compte en cas
              de non-respect des présentes CGV ou d&apos;usage abusif du service.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">3. Offres et tarifs</h3>
            <p>Les offres payantes sont proposées sous forme d&apos;abonnements :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[var(--text)]">Abonnement mensuel</strong> : 39,90 € TTC
                / mois, sans engagement
              </li>
              <li>
                <strong className="text-[var(--text)]">Abonnement annuel</strong> : 430 € TTC /
                an, avec engagement de 12 mois
              </li>
            </ul>
            <p>
              Les prix sont indiqués toutes taxes comprises. Conformément à l&apos;article 293
              B du Code général des impôts, la TVA n&apos;est pas applicable.
            </p>
            <p>Aucune période d&apos;essai n&apos;est proposée pour les offres payantes.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">4. Modalités de paiement</h3>
            <p>Le paiement est effectué par carte bancaire via la solution sécurisée Stripe.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Abonnement mensuel : facturation mensuelle automatique</li>
              <li>Abonnement annuel : facturation annuelle en une seule fois</li>
            </ul>
            <p>Le paiement est exigible à la souscription, puis à chaque renouvellement.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">5. Durée et renouvellement</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>L&apos;abonnement mensuel est reconduit tacitement chaque mois.</li>
              <li>
                L&apos;abonnement annuel est conclu pour une durée ferme de 12 mois et est
                reconduit tacitement à son terme, sauf résiliation avant l&apos;échéance.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">6. Résiliation</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[var(--text)]">Abonnement mensuel</strong> : résiliable à
                tout moment, la résiliation prenant effet à la fin de la période mensuelle en
                cours.
              </li>
              <li>
                <strong className="text-[var(--text)]">Abonnement annuel</strong> : résiliable
                uniquement à l&apos;issue de la période d&apos;engagement de 12 mois.
              </li>
            </ul>
            <p>Aucun remboursement ne sera effectué pour une période entamée.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">7. Droit de rétractation</h3>
            <p>
              Conformément à l&apos;article L221-3 du Code de la consommation, le droit de
              rétractation ne s&apos;applique pas aux contrats conclus entre professionnels.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">8. Disponibilité du service</h3>
            <p>
              L&apos;éditeur met en œuvre les moyens raisonnables pour assurer l&apos;accessibilité
              du service, sans garantie d&apos;absence d&apos;interruption.
            </p>
            <p>Des opérations de maintenance peuvent entraîner des suspensions temporaires.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">9. Responsabilité</h3>
            <p>L&apos;éditeur ne saurait être tenu responsable :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>des interruptions de service indépendantes de sa volonté,</li>
              <li>des pertes de données imputables à l&apos;utilisateur,</li>
              <li>des dommages indirects ou pertes d&apos;exploitation.</li>
            </ul>
            <p>
              La responsabilité de l&apos;éditeur est, en tout état de cause, limitée au montant
              des sommes effectivement payées par l&apos;utilisateur sur les 12 derniers mois.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              10. Propriété intellectuelle
            </h3>
            <p>
              L&apos;ensemble du service (logiciel, interface, contenus, marques) est la
              propriété exclusive de l&apos;éditeur.
            </p>
            <p>Toute reproduction, exploitation ou utilisation non autorisée est interdite.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">11. Données personnelles</h3>
            <p>
              Les modalités de traitement des données personnelles sont détaillées dans la
              Politique de confidentialité accessible sur le site.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">12. Droit applicable</h3>
            <p>Les présentes CGV sont soumises au droit français.</p>
            <p>Tout litige relèvera de la compétence des tribunaux français.</p>
          </section>
        </div>
      </article>

      <div>
        <Link
          href={returnTo}
          className="text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </Link>
      </div>
    </main>
  );
}
