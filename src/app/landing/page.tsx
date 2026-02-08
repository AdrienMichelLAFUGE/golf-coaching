import Image from "next/image";
import Link from "next/link";
import LandingReveal from "./landing-reveal";
import ReportsFeatureShowcase from "./reports-feature-showcase";
import Hero from "@/components/hero/Hero";
import CentralizationSection from "./CentralizationSection";
import PricingOffersContent from "@/components/pricing/PricingOffersContent";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { pricingPlansSchema, type PricingPlan } from "@/lib/pricing/types";

const IconUser = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 19.2c1.6-3.4 5-5.2 7.5-5.2s5.9 1.8 7.5 5.2" />
  </svg>
);

const IconChart = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M3.5 19.5h17" />
    <path d="M6.5 16.5l4.2-5 3 3.2 4.3-6" />
    <circle cx="6.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.7" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="13.7" cy="14.7" r="1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="8.7" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconDoc = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M7 3.5h6.5L19.5 9v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
    <path d="M13.5 3.5V9H19" />
    <path d="M8.5 12h7" />
    <path d="M8.5 15.5h7" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M5.5 12.5l4 4 9-9" />
  </svg>
);

export default async function LandingPage() {
  let pricingPlans: PricingPlan[] = [];
  let pricingPlansError: string | null = null;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("pricing_plans")
      .select(
        "id, slug, label, price_cents, currency, interval, badge, cta_label, features, is_active, is_highlighted, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Unable to load pricing plans for landing.", error);
      pricingPlansError = "Impossible de charger les offres pour le moment.";
    } else {
      const parsed = pricingPlansSchema.safeParse(data ?? []);
      if (!parsed.success) {
        console.error("Invalid pricing plans payload for landing.", parsed.error);
        pricingPlansError = "Impossible de charger les offres pour le moment.";
      } else {
        pricingPlans = parsed.data;
      }
    }
  } catch (err) {
    console.error("Unexpected pricing plans load failure.", err);
    pricingPlansError = "Impossible de charger les offres pour le moment.";
  }

  return (
    <main className="relative min-h-screen px-4 pb-28 pt-12 md:px-8 md:pb-36 md:pt-16">
      <LandingReveal />
      <div className="pointer-events-none absolute -left-40 top-[-160px] h-[360px] w-[360px] rounded-full bg-emerald-400/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 top-[80px] h-[320px] w-[320px] rounded-full bg-sky-400/15 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/2 top-[520px] h-[260px] w-[520px] -translate-x-1/2 rounded-[999px] bg-white/5 blur-[80px]" />

      <div className="mx-auto max-w-6xl space-y-24 md:space-y-32">
        <div className="reveal" data-reveal-stagger>
          <div
            className="flex flex-wrap items-center justify-between gap-4"
            data-reveal-item
          >
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/branding/logo.png"
                alt="Logo SwingFlow"
                width={250}
                height={250}
                priority
                className="h-50 w-50 object-contain p-1"
              />
              <Image
                src="/branding/wordmark.png"
                alt="SwingFlow"
                width={320}
                height={96}
                priority
                className="h-15 w-auto max-w-[min(420px,70vw)] object-contain"
              />
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 active:scale-[0.98]"
            >
              Se connecter
            </Link>
          </div>
        </div>

        <Hero />

        <CentralizationSection />

        <section
          className="reveal panel-outline relative overflow-hidden rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[90%]"
          data-reveal-stagger
        >
          <div className="pointer-events-none absolute -right-24 top-6 h-40 w-40 rounded-full bg-emerald-400/10 blur-[60px]" />
          <div className="pointer-events-none absolute -left-24 bottom-6 h-36 w-36 rounded-full bg-sky-400/10 blur-[60px]" />
          <div className="max-w-2xl" data-reveal-item>
            <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
              Le parcours en 4 étapes
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Ajoutez un élève, importez vos données, construisez le rapport, publiez-le.
              L&apos;élève le consulte dans son espace.
            </p>
          </div>
          <div className="mt-10">
            <div className="relative space-y-4 lg:hidden">
              <span className="absolute left-4 top-0 h-full w-px bg-white/15" />
              {[
                { label: "Élève", icon: <IconUser /> },
                { label: "TPI et radar", icon: <IconChart /> },
                { label: "Rapport", icon: <IconDoc /> },
                { label: "Publication", icon: <IconCheck /> },
              ].map((step, index) => (
                <div key={step.label} className="relative pl-10" data-reveal-item>
                  <span className="absolute left-2 top-6 h-3 w-3 -translate-x-1/2 rounded-full bg-emerald-400/40" />
                  <div className="relative z-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                    <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                      {step.icon}
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Étape {index + 1}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text)]">{step.label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden lg:grid lg:grid-cols-4 lg:grid-rows-[auto_2rem_auto] lg:gap-x-6 lg:gap-y-0">
              <div className="relative lg:col-start-1 lg:row-start-1" data-reveal-item>
                <div className="relative z-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                  <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                    <IconUser />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Étape 1
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]">Élève</p>
                  </div>
                </div>
                <span className="absolute left-1/2 top-full hidden h-4 w-px -translate-x-1/2 bg-white/20 lg:block" />
              </div>
              <div className="relative lg:col-start-2 lg:row-start-3" data-reveal-item>
                <span className="absolute bottom-full left-1/2 hidden h-4 w-px -translate-x-1/2 bg-white/20 lg:block" />
                <div className="relative z-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                  <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                    <IconChart />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Étape 2
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]">TPI et radar</p>
                  </div>
                </div>
              </div>
              <div className="relative lg:col-start-3 lg:row-start-1" data-reveal-item>
                <div className="relative z-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                  <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                    <IconDoc />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Étape 3
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]">Rapport</p>
                  </div>
                </div>
                <span className="absolute left-1/2 top-full hidden h-4 w-px -translate-x-1/2 bg-white/20 lg:block" />
              </div>
              <div className="relative lg:col-start-4 lg:row-start-3" data-reveal-item>
                <span className="absolute bottom-full left-1/2 hidden h-4 w-px -translate-x-1/2 bg-white/20 lg:block" />
                <div className="relative z-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                  <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                    <IconCheck />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Étape 4
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]">Publication</p>
                  </div>
                </div>
              </div>
              <div className="relative hidden lg:col-span-4 lg:row-start-2 lg:block">
                <div className="absolute left-4 right-4 top-1/2 h-px bg-white/20" />
              </div>
            </div>
          </div>
        </section>

        <ReportsFeatureShowcase />

        <section className="reveal rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[92%]" data-reveal-stagger>
          <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
            Données TPI et radar intégrées
          </h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            <span className="block">
              Importez le rapport TPI et vos exports radar (Flightscope).
            </span>
            <span className="mt-2 block">40+ graphiques disponibles.</span>
            <span className="mt-2 block">
              L&apos;IA peut en sélectionner automatiquement pour appuyer les notions vues en
              séance et expliquer clairement les points à l&apos;élève.
            </span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            <span>TPI</span>
            <span>Flightscope</span>
            <span>Radar</span>
            <span>Synthèse</span>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                src: "/landing/graphs/tpi-exemple.png",
                label: "Profil TPI",
                width: 857,
                height: 607,
                full: true,
                maxWidth: "max-w-[860px]",
                sizes: "(min-width: 1024px) 860px, (min-width: 640px) 90vw, 100vw",
              },
              {
                src: "/landing/graphs/spin-vs-carry.png",
                label: "Spin vs carry",
                width: 457,
                height: 611,
                maxWidth: "max-w-[460px]",
                sizes: "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 100vw",
              },
              {
                src: "/landing/graphs/vitesse-club-balle.png",
                label: "Vitesse club / balle",
                width: 455,
                height: 608,
                maxWidth: "max-w-[460px]",
                sizes: "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 100vw",
              },
              {
                src: "/landing/graphs/carry-vs-total.png",
                label: "Carry vs total",
                width: 455,
                height: 622,
                maxWidth: "max-w-[460px]",
                sizes: "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 100vw",
              },
              {
                src: "/landing/graphs/dispersion.png",
                label: "Dispersion",
                width: 459,
                height: 625,
                maxWidth: "max-w-[460px]",
                sizes: "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 100vw",
              },
              {
                src: "/landing/graphs/impact-face.png",
                label: "Impact face",
                width: 940,
                height: 688,
                wide: true,
                maxWidth: "max-w-[940px]",
                sizes: "(min-width: 1024px) 940px, (min-width: 640px) 90vw, 100vw",
              },
            ].map((graph) => (
              <figure
                key={graph.src}
                data-reveal-item
                className={`mx-auto w-full transition hover:-translate-y-1 ${
                  graph.full
                    ? "sm:col-span-2 lg:col-span-3"
                    : graph.wide
                      ? "sm:col-span-2 lg:col-span-2"
                      : ""
                } ${graph.maxWidth ?? ""}`}
              >
                <Image
                  src={graph.src}
                  alt={graph.label}
                  width={graph.width}
                  height={graph.height}
                  sizes={graph.sizes}
                  className="h-auto w-full rounded-2xl object-contain shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
                />
                <figcaption className="mt-2 text-xs text-[var(--muted)]">
                  {graph.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch">
          <section
            className="reveal panel-soft h-full rounded-3xl p-8 md:p-10"
            data-reveal-stagger
          >
          <div data-reveal-item>
            <div className="flex items-start gap-4 text-[var(--muted)]">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                  Travailler à plusieurs
                </h2>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  - Partage d&apos;élève entre coachs <br />
                  - Système d&apos;assignation coach/élève en mode structure. <br />
                  <br />
                  Idéal pour les structures avec plusieurs coachs.
                </p>
              </div>
            </div>
              <div className="mt-6 grid gap-4 text-sm text-[var(--muted)] sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                    Workspace perso
                  </div>
                <p className="mt-3 text-sm text-[var(--text)]">
                  Partage d&apos;élève entre coachs.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="rounded-full border border-white/20 px-3 py-1">
                    Coach
                  </span>
                  <span>-</span>
                  <span className="rounded-full border border-white/20 px-3 py-1">
                    Élève
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                  Workspace orga
                </div>
                <p className="mt-3 text-sm text-[var(--text)]">
                  Assignation spécifique pour un travail robuste en équipe.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="rounded-full border border-white/20 px-3 py-1">
                    Coach A
                  </span>
                  <span>-</span>
                  <span className="rounded-full border border-white/20 px-3 py-1">
                    Élève
                  </span>
                  <span>-</span>
                  <span className="rounded-full border border-white/20 px-3 py-1">
                    Coach B
                  </span>
                </div>
              </div>
            </div>
          </div>
          </section>

          <section className="reveal panel-outline h-full rounded-3xl p-8 md:p-10">
          <div className="space-y-10">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                Tests standardisés pour vos élèves
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                - Assignez des tests normalisés et suivez leur statut.<br />
                - L&apos;élève les complète directement depuis son espace.<br />
                - Créez vos propres tests personnalisés.
              </p>
              <div className="mt-6 divide-y divide-white/10 text-sm text-[var(--muted)]">
                <div className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        Pelz putting
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Contrôle précision courte distance
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        À faire
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">12/03</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
                    <div className="h-full w-1/3 rounded-full bg-amber-400/40" />
                  </div>
                </div>
                <div className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        Wedging drapeau
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Régularité distance cible
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        En cours
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">18/03</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
                    <div className="h-full w-2/3 rounded-full bg-emerald-400/40" />
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-white/10" aria-hidden="true" />

            <div>
              <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                Un espace élève clair
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Chaque élève retrouve ses rapports publiés et ses tests à compléter.<br />
                Pas d&apos;outil externe à fournir.
              </p>
              <div className="panel-outline mt-6 rounded-2xl px-4 py-4 text-sm text-[var(--muted)]">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span>Rapport séance du 10/03</span>
                  <span>Lire</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-b border-white/10 pb-2">
                  <span>Rapport séance du 28/02</span>
                  <span>Lire</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Test putting à compléter</span>
                  <span>Voir</span>
                </div>
              </div>
            </div>
          </div>
          </section>
        </div>
        <section className="reveal" data-reveal-stagger>
          <div
            data-reveal-item
            className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 md:px-8"
          >
            <PricingOffersContent
              variant="marketing"
              plans={pricingPlans}
              error={pricingPlansError ?? ""}
            />
          </div>
        </section>

        <section className="reveal panel-outline rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[92%] flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text)]">
              Prêt à centraliser votre suivi ?
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Créez un compte coach et découvrez l&apos;espace de travail.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
          >
            La plateforme arrive bientôt...
          </Link>
        </section>

        <footer className="pt-10 text-xs text-[var(--muted)]">
          <div className="mx-auto max-w-6xl border-t border-white/10 pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p>©2026 SwingFlow – Tous droits réservés</p>
              <nav aria-label="Liens légaux" className="flex flex-wrap gap-x-2 gap-y-1">
                <Link
                  href="/mentions-legales"
                  className="transition hover:text-[var(--text)]"
                >
                  Mentions légales
                </Link>
                <span aria-hidden="true">·</span>
                <Link href="/cgv" className="transition hover:text-[var(--text)]">
                  CGV
                </Link>
                <span aria-hidden="true">·</span>
                <Link href="/cgu" className="transition hover:text-[var(--text)]">
                  CGU
                </Link>
                <span aria-hidden="true">·</span>
                <Link
                  href="/politique-de-confidentialite"
                  className="transition hover:text-[var(--text)]"
                >
                  Politique de confidentialité
                </Link>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
