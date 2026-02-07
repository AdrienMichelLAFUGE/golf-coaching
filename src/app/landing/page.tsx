import Image from "next/image";
import Link from "next/link";
import LandingReveal from "./landing-reveal";
import ReportsFeatureShowcase from "./reports-feature-showcase";
import Hero from "@/components/hero/Hero";

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

export default function LandingPage() {
  return (
    <main className="relative min-h-screen px-4 pb-28 pt-12 md:px-8 md:pb-36 md:pt-16">
      <LandingReveal />
      <div className="pointer-events-none absolute -left-40 top-[-160px] h-[360px] w-[360px] rounded-full bg-emerald-400/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 top-[80px] h-[320px] w-[320px] rounded-full bg-sky-400/15 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/2 top-[520px] h-[260px] w-[520px] -translate-x-1/2 rounded-[999px] bg-white/5 blur-[80px]" />

      <div className="mx-auto max-w-6xl space-y-24 md:space-y-32">
        <div className="reveal snap-start landing-snap-section" data-reveal-stagger>
          <div
            className="flex flex-wrap items-center justify-between gap-4"
            data-reveal-item
          >
            <Image
              src="/branding/swingflow-logov2.png"
              alt="SwingFlow"
              width={600}
              height={300}
              priority
              className="h-auto w-[600px] max-w-full"
            />
            <Link
              href="/login"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 active:scale-[0.98]"
            >
              Login
            </Link>
          </div>
        </div>

        <Hero />

        <section
          className="reveal snap-start landing-snap-section panel-soft rounded-3xl p-8 md:p-10 lg:ml-auto lg:max-w-[90%]"
          data-reveal-stagger
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
            <div className="lg:order-2" data-reveal-item>
              <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                Ce que le produit simplifie
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Plus besoin de jongler entre notes, exports et documents separes. Tout
                le suivi eleve est regroupe et lisible.
              </p>
            </div>
            <div className="space-y-4 text-sm text-[var(--muted)] lg:order-1">
              <div className="panel-outline rounded-2xl px-4 py-4" data-reveal-item>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Avant
                </p>
                <p className="mt-2">
                  Notes dispersees, fichiers radar isoles, rapports a part.
                </p>
              </div>
              <div className="panel-outline rounded-2xl px-4 py-4" data-reveal-item>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Apres
                </p>
                <p className="mt-2">
                  Un espace unique pour suivre, analyser et publier.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="reveal snap-start landing-snap-section panel-outline relative overflow-hidden rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[90%]"
          data-reveal-stagger
        >
          <div className="pointer-events-none absolute -right-24 top-6 h-40 w-40 rounded-full bg-emerald-400/10 blur-[60px]" />
          <div className="pointer-events-none absolute -left-24 bottom-6 h-36 w-36 rounded-full bg-sky-400/10 blur-[60px]" />
          <div className="max-w-2xl" data-reveal-item>
            <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
              Le parcours en 4 etapes
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Ajoutez un eleve, importez vos donnees, construisez le rapport, publiez-le.
              L eleve le consulte dans son espace.
            </p>
          </div>
          <div className="mt-10">
            <div className="relative space-y-4 lg:hidden">
              <span className="absolute left-4 top-0 h-full w-px bg-white/15" />
              {[
                { label: "Eleve", icon: <IconUser /> },
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
                        Etape {index + 1}
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
                      Etape 1
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]">Eleve</p>
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
                      Etape 2
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
                      Etape 3
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
                      Etape 4
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

        <section
          className="reveal snap-start landing-snap-section rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[92%]"
          data-reveal-stagger
        >
          <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
            Donnees TPI et radar integrees
          </h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            <span className="block">
              Importez rapport TPI et vos exports radar (Flightscope).
            </span>
            <span className="mt-2 block">40+ graphiques disponibles.</span>
            <span className="mt-2 block">
              L&apos;IA peut en selectionner automatiquement pour appuyer les notions vues en
              seance et expliquer clairement les points a l eleve.
            </span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            <span>TPI</span>
            <span>Flightscope</span>
            <span>Radar</span>
            <span>Synthese</span>
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

        <section
          className="reveal snap-start landing-snap-section panel-soft rounded-3xl p-8 md:p-10 lg:ml-auto lg:max-w-[90%]"
          data-reveal-stagger
        >
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div className="lg:order-2" data-reveal-item>
              <div className="flex items-start gap-4 text-[var(--muted)]">
                <div>
                  <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                    Tests standardisés pour vos eleves
                  </h2>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    - Assignez des tests normalisés et suivez leur statut.<br />
                    - L&apos;eleve les complete directement depuis son espace.<br />
                    - Créez vos propres tests personnalisés.
                  </p>
                </div>
              </div>
              <div className="mt-6 divide-y divide-white/10 text-sm text-[var(--muted)]">
                <div className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        Pelz putting
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Controle precision courte distance
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        A faire
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
                        Regularite distance cible
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

            <div className="lg:order-1" data-reveal-item>
              <div className="flex items-start gap-4 text-[var(--muted)]">
                <div>
                  <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                    Travailler a plusieurs
                  </h2>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    - Partage élève entre coachs <br/>
                    - Systeme d&apos;assignation coach/eleve en mode Structure. <br />
                    <br />
                    Idéal pour les structures avec plusieurs coaches.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 text-sm text-[var(--muted)] sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                    Workspace perso
                  </div>
                  <p className="mt-3 text-sm text-[var(--text)]">
                    Partage d eleve entre coachs.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="rounded-full border border-white/20 px-3 py-1">
                      Coach
                    </span>
                    <span>-</span>
                    <span className="rounded-full border border-white/20 px-3 py-1">
                      Eleve
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                    Workspace orga
                  </div>
                  <p className="mt-3 text-sm text-[var(--text)]">
                    Assignation specifique pour un travail robuste en équipe.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="rounded-full border border-white/20 px-3 py-1">
                      Coach A
                    </span>
                    <span>-</span>
                    <span className="rounded-full border border-white/20 px-3 py-1">
                      Eleve
                    </span>
                    <span>-</span>
                    <span className="rounded-full border border-white/20 px-3 py-1">
                      Coach B
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="reveal snap-start landing-snap-section panel-outline rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[92%]">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                Un espace élève clair
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Chaque eleve retrouve ses rapports publies et ses tests a completer.<br />
                Pas d&apos;outil externe a fournir.
              </p>
            </div>
            <div className="panel-outline rounded-2xl px-4 py-4 text-sm text-[var(--muted)]">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span>Rapport séance du 10/03</span>
                <span>Lire</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-b border-white/10 pb-2">
                <span>Rapport séance du 28/02</span>
                <span>Lire</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Test putting à completer</span>
                <span>Voir</span>
              </div>
            </div>
          </div>
        </section>

        <section className="snap-start landing-snap-section panel-soft rounded-3xl p-8 md:p-10 lg:ml-auto lg:max-w-[92%]">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
              Plans & limites
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Choisissez le niveau adapte a votre usage et a votre organisation.
            </p>
          </div>
          <div className="mt-6 grid gap-4 text-sm text-[var(--muted)] lg:grid-cols-3">
            <div className="panel-outline rounded-2xl px-4 py-4">
              <div className="flex items-center gap-3 text-[var(--text)]">
                <span className="rounded-full bg-emerald-400/10 p-2 text-emerald-100">
                  <IconCheck />
                </span>
                <span className="text-sm font-semibold">Free</span>
              </div>
              <div className="mt-3 space-y-2">
                <div>Decouvrir SwingFlow</div>
                <div>Relecture IA basique</div>
                <div>Usage leger</div>
              </div>
            </div>
            <div className="panel-outline rounded-2xl px-4 py-4">
              <div className="flex items-center gap-3 text-[var(--text)]">
                <span className="rounded-full bg-emerald-400/10 p-2 text-emerald-100">
                  <IconCheck />
                </span>
                <span className="text-sm font-semibold">Pro</span>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-100">
                  Plan principal
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div>Toutes les fonctionnalites SwingFlow</div>
                <div>IA avancee</div>
                <div>Datas, rapports, tests</div>
                <div>Pour coachs professionnels</div>
              </div>
            </div>
            <div className="panel-outline rounded-2xl px-4 py-4">
              <div className="flex items-center gap-3 text-[var(--text)]">
                <span className="rounded-full bg-emerald-400/10 p-2 text-emerald-100">
                  <IconCheck />
                </span>
                <span className="text-sm font-semibold">Enterprise</span>
              </div>
              <div className="mt-3 space-y-2">
                <div>Organisations & academies</div>
                <div>Gestion multi-comptes</div>
                <div>Collaboration</div>
                <div>CRM / gouvernance</div>
                <div className="text-[var(--text)]">Nous contacter</div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/login"
              className="text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Voir les plans dans l app
            </Link>
          </div>
        </section>

        <section className="reveal snap-start landing-snap-section panel-outline rounded-3xl p-8 md:p-10 lg:mr-auto lg:max-w-[92%] flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text)]">
              Pret a centraliser votre suivi ?
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Creez un compte coach et decouvrez l espace de travail.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
          >
            Creer un compte coach
          </Link>
        </section>
      </div>
    </main>
  );
}
