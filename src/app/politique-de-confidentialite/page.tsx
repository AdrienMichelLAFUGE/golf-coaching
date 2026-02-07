import Link from "next/link";
import LandingReveal from "../landing/landing-reveal";

export default function PolitiqueDeConfidentialitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16 text-[var(--text)]">
      <LandingReveal />

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">SwingFlow</p>
        <h1 className="text-3xl font-semibold">Politique de confidentialité</h1>
        <p className="text-sm text-[var(--muted)]">
          Informations sur la collecte et le traitement des données personnelles.
        </p>
      </header>

      <article className="panel-outline rounded-3xl px-6 py-6 text-sm text-[var(--muted)]">
        <div className="space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Politique de confidentialité
            </h2>
            <p>
              La présente Politique de confidentialité a pour objet d&apos;informer les
              utilisateurs de la plateforme éditée par{" "}
              <strong className="text-[var(--text)]">EI LAFUGE ADRIEN</strong> sur la manière
              dont leurs données personnelles sont collectées, utilisées et protégées,
              conformément au Règlement Général sur la Protection des Données (RGPD).
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">1. Responsable du traitement</h3>
            <p>
              Le responsable du traitement des données est :{" "}
              <strong className="text-[var(--text)]">LAFUGE ADRIEN</strong>, entreprise
              individuelle.
            </p>
            <p>Domaine de la Plaine, 45240 Marcilly-en-Villette, France</p>
            <p>
              Email :{" "}
              <a className="underline underline-offset-4" href="mailto:contact@adrienlafuge.com">
                contact@adrienlafuge.com
              </a>
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">2. Données collectées</h3>
            <p>Les données susceptibles d&apos;être collectées sont notamment :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>données d&apos;identification (nom, prénom, email),</li>
              <li>données professionnelles,</li>
              <li>données de connexion,</li>
              <li>
                données relatives aux clients (élèves) de l&apos;utilisateur, saisies par ce
                dernier,
              </li>
              <li>données de paiement (traitées exclusivement par Stripe).</li>
            </ul>
            <p>Aucune donnée de paiement n&apos;est stockée par l&apos;éditeur.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">3. Finalités du traitement</h3>
            <p>Les données sont collectées pour :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>fournir l&apos;accès à la plateforme et à ses fonctionnalités,</li>
              <li>gérer les abonnements et paiements,</li>
              <li>assurer le support utilisateur,</li>
              <li>assurer la sécurité et le bon fonctionnement du service.</li>
            </ul>
            <p>Aucun outil d&apos;analyse ou de suivi de type analytics n&apos;est utilisé.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">4. Base légale du traitement</h3>
            <p>Les traitements sont fondés sur :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>l&apos;exécution du contrat (CGU / CGV),</li>
              <li>les obligations légales,</li>
              <li>
                l&apos;intérêt légitime de l&apos;éditeur à assurer le bon fonctionnement du
                service.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">5. Hébergement et sous-traitants</h3>
            <p>Les données sont hébergées via :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[var(--text)]">Supabase</strong> (stockage des données),
              </li>
              <li>
                <strong className="text-[var(--text)]">Stripe</strong> (paiements).
              </li>
            </ul>
            <p>Ces prestataires agissent en qualité de sous-traitants au sens du RGPD.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">6. Durée de conservation</h3>
            <p>Les données sont conservées :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>pendant la durée de la relation contractuelle,</li>
              <li>
                puis supprimées ou anonymisées à l&apos;issue, sauf obligations légales
                contraires.
              </li>
            </ul>
            <p>Les utilisateurs peuvent supprimer eux-mêmes leurs données depuis leur interface.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">7. Sécurité</h3>
            <p>
              L&apos;éditeur met en œuvre des mesures techniques et organisationnelles raisonnables
              pour protéger les données contre tout accès non autorisé, perte ou altération.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">8. Droits des utilisateurs</h3>
            <p>Conformément au RGPD, les utilisateurs disposent des droits suivants :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>droit d&apos;accès,</li>
              <li>droit de rectification,</li>
              <li>droit à l&apos;effacement,</li>
              <li>droit à la limitation du traitement,</li>
              <li>droit d&apos;opposition,</li>
              <li>droit à la portabilité.</li>
            </ul>
            <p>
              Toute demande peut être adressée à{" "}
              <a className="underline underline-offset-4" href="mailto:contact@adrienlafuge.com">
                contact@adrienlafuge.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              9. Transferts hors Union européenne
            </h3>
            <p>
              Certains prestataires (notamment Stripe) peuvent être situés hors de l&apos;Union
              européenne. Des garanties appropriées sont mises en place conformément à la
              réglementation en vigueur.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">10. Cookies</h3>
            <p>
              Le site n&apos;utilise pas de cookies de suivi ou d&apos;analyse. Seuls des cookies
              strictement nécessaires au fonctionnement du service peuvent être utilisés.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              11. Modification de la politique
            </h3>
            <p>
              La présente politique peut être modifiée à tout moment afin de refléter les
              évolutions du service ou de la réglementation.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">12. Droit applicable</h3>
            <p>La présente Politique de confidentialité est soumise au droit français.</p>
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
