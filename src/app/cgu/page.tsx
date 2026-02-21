import Link from "next/link";
import LandingReveal from "../landing/landing-reveal";

const resolveReturnTo = (value?: string | string[] | null) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/landing";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/landing";
  if (raw.includes("\\")) return "/landing";
  return raw;
};

export default async function CguPage({
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
        <h1 className="text-3xl font-semibold">CGU</h1>
        <p className="text-sm text-[var(--muted)]">Conditions générales d&apos;utilisation.</p>
      </header>

      <article className="panel-outline rounded-3xl px-6 py-6 text-sm text-[var(--muted)]">
        <div className="space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Conditions générales d&apos;utilisation (CGU)
            </h2>
            <p>
              Les présentes Conditions générales d&apos;utilisation ont pour objet de définir
              les règles d&apos;accès et d&apos;utilisation de la plateforme SaaS éditée par{" "}
              <strong className="text-[var(--text)]">EI LAFUGE ADRIEN</strong>, entreprise
              individuelle immatriculée sous le numéro SIREN 894 371 624.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">1. Objet du service</h3>
            <p>
              La plateforme est un logiciel en ligne destiné aux coachs de golf et structures
              professionnelles, permettant la centralisation et la gestion de données liées
              à leur activité.
            </p>
            <p>L&apos;accès au service est réservé à un usage professionnel.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">2. Création de compte</h3>
            <p>L&apos;accès au service nécessite la création d&apos;un compte utilisateur.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Un compte correspond à un seul coach.</li>
              <li>Les identifiants sont strictement personnels et confidentiels.</li>
            </ul>
            <p>L&apos;utilisateur est responsable de toute activité effectuée via son compte.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">3. Utilisation de la plateforme</h3>
            <p>L&apos;utilisateur s&apos;engage à :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>utiliser la plateforme conformément à sa finalité,</li>
              <li>ne pas tenter d&apos;accéder de manière non autorisée aux systèmes,</li>
              <li>ne pas perturber le fonctionnement du service,</li>
              <li>respecter la législation en vigueur.</li>
            </ul>
            <p>
              Toute utilisation abusive ou frauduleuse pourra entraîner la suspension ou la
              suppression du compte.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">4. Données utilisateur</h3>
            <p>
              L&apos;utilisateur peut stocker sur la plateforme des données relatives à ses
              propres clients (élèves), sous sa seule responsabilité.
            </p>
            <p>Ces données sont hébergées via l&apos;infrastructure Supabase.</p>
            <p>
              L&apos;utilisateur garantit être autorisé à traiter les données qu&apos;il importe et
              s&apos;engage à respecter la réglementation applicable, notamment le RGPD.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">5. Sécurité</h3>
            <p>
              L&apos;éditeur met en œuvre des mesures techniques raisonnables pour assurer la
              sécurité des données.
            </p>
            <p>L&apos;utilisateur demeure responsable :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>de la sécurité de ses identifiants,</li>
              <li>des données qu&apos;il saisit,</li>
              <li>de la sauvegarde de ses données.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">6. Disponibilité du service</h3>
            <p>
              La plateforme est accessible 24h/24 et 7j/7, sauf interruption pour maintenance
              ou cas de force majeure.
            </p>
            <p>Aucune garantie de disponibilité continue n&apos;est fournie.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              7. Suspension et suppression de compte
            </h3>
            <p>
              L&apos;éditeur se réserve le droit de suspendre ou supprimer un compte, sans
              préavis, en cas :
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>de violation des CGU ou des CGV,</li>
              <li>d&apos;usage illicite ou abusif,</li>
              <li>de non-paiement.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              8. Propriété intellectuelle
            </h3>
            <p>
              La plateforme, son code, son design et ses fonctionnalités sont la propriété
              exclusive de l&apos;éditeur.
            </p>
            <p>L&apos;utilisateur conserve la propriété des données qu&apos;il renseigne.</p>
            <p>Toute reproduction ou exploitation non autorisée est interdite.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">9. Responsabilité</h3>
            <p>L&apos;éditeur ne saurait être tenu responsable :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>des pertes de données imputables à l&apos;utilisateur,</li>
              <li>des erreurs ou omissions dans les données saisies,</li>
              <li>des dommages indirects liés à l&apos;utilisation du service.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">10. Évolution du service</h3>
            <p>
              L&apos;éditeur se réserve le droit de faire évoluer, modifier ou interrompre tout
              ou partie du service, notamment pour des raisons techniques ou
              d&apos;amélioration.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">11. Données personnelles</h3>
            <p>
              Les traitements de données personnelles sont détaillés dans la Politique de
              confidentialité accessible sur le site.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">12. Droit applicable</h3>
            <p>Les présentes CGU sont soumises au droit français.</p>
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
