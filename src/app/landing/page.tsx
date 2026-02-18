import { existsSync } from "fs";
import { join } from "path";
import Image from "next/image";
import Link from "next/link";
import Hero from "@/components/hero/Hero";
import PricingOffersContent from "@/components/pricing/PricingOffersContent";
import TrackedCtaLink from "@/components/marketing/TrackedCtaLink";
import { getSiteBaseUrl } from "@/lib/env/public";
import { pricingPlansSchema, type PricingPlan } from "@/lib/pricing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import SectionsReadyIllustration from "./illustrations/SectionsReadyIllustration";
import LandingReveal from "./landing-reveal";
import StickyLandingHeader from "./StickyLandingHeader";
import Testimonial from "./Testimonial";
import { landingCopy } from "./landing-copy";

function resolveLandingScreenshot(fileName: string, fallbackSrc: string): string {
  const screenshotPath = join(process.cwd(), "public", "landing", "screenshots", fileName);
  return existsSync(screenshotPath) ? `/landing/screenshots/${fileName}` : fallbackSrc;
}

export default async function LandingPage() {
  const showSocialProof = false;
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
  } catch (error) {
    console.error("Unexpected pricing plans load failure.", error);
    pricingPlansError = "Impossible de charger les offres pour le moment.";
  }

  const siteBaseUrl = getSiteBaseUrl();
  const dashboardOverviewImageSrc = resolveLandingScreenshot(
    "dashboard-eleve-overview.png",
    "/landing/graphs/vitesse-club-balle.png"
  );
  const coachDashboardImageSrc = resolveLandingScreenshot(
    "dashboard-coach.png",
    "/landing/graphs/tpi-exemple.png"
  );
  const calendarCoachImageSrc = resolveLandingScreenshot(
    "calendar-coach.png",
    coachDashboardImageSrc
  );
  const calendarStudentImageSrc = resolveLandingScreenshot(
    "calendar-student.png",
    dashboardOverviewImageSrc
  );
  const groupManagementImageSrc = resolveLandingScreenshot(
    "gestion-groupe.png",
    "/landing/screenshots/IA-autoLayout.png"
  );

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SwingFlow",
    legalName: "EI LAFUGE ADRIEN",
    url: siteBaseUrl,
    email: "contact@swingflow.fr",
    sameAs: [] as string[],
  };

  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SwingFlow",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteBaseUrl,
    description:
      "Plateforme de coaching golf pour centraliser les fiches élèves, assurer un suivi continu et générer des rapports intelligents.",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: 0,
      priceCurrency: "EUR",
      offerCount: 3,
    },
    provider: {
      "@type": "Organization",
      name: "EI LAFUGE ADRIEN",
    },
  };

  return (
    <main className="relative min-h-screen px-4 pb-28 pt-12 md:px-8 md:pb-36 md:pt-16">
      <LandingReveal />
      <div className="pointer-events-none absolute -left-40 top-[-160px] h-[360px] w-[360px] rounded-full bg-emerald-400/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 top-[80px] h-[320px] w-[320px] rounded-full bg-sky-400/15 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/2 top-[520px] h-[260px] w-[520px] -translate-x-1/2 rounded-[999px] bg-white/5 blur-[80px]" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />

      <div className="mx-auto max-w-6xl space-y-20 md:space-y-28">
        <header className="reveal" data-reveal-stagger>
          <div
            className="flex flex-wrap items-center justify-between gap-4"
            data-reveal-item
          >
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <Image
                src="/branding/logo.png"
                alt="Logo SwingFlow"
                width={64}
                height={64}
                priority
                className="h-10 w-10 shrink-0 object-contain"
              />
              <Image
                src="/branding/wordmark.png"
                alt="SwingFlow"
                width={320}
                height={96}
                priority
                className="h-7 w-auto min-w-0 max-w-[min(220px,60vw)] object-contain sm:h-8 sm:max-w-[min(320px,70vw)]"
              />
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <TrackedCtaLink
                href="/login?mode=signin"
                tracking={{
                  id: "landing_header_signin",
                  location: "landing_header",
                  target: "/login?mode=signin",
                }}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 active:scale-[0.98]"
              >
                Se connecter
              </TrackedCtaLink>
              <TrackedCtaLink
                href="/login?mode=signup"
                tracking={{
                  id: "landing_header_signup",
                  location: "landing_header",
                  target: "/login?mode=signup",
                }}
                className="inline-flex rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
              >
                Créer un compte coach
              </TrackedCtaLink>
            </div>
          </div>
        </header>

        <Hero />

        <StickyLandingHeader />

        <section className="reveal relative overflow-visible" data-reveal-stagger>
          <div className="pointer-events-none absolute -left-16 top-8 h-48 w-48 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-4 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />

          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="space-y-5" data-reveal-item>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Calendrier structure
              </p>
              <h2 className="text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
                {landingCopy.calendarFeature.title}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
                {landingCopy.calendarFeature.subtitle}
              </p>

              <ul className="space-y-3">
                {landingCopy.calendarFeature.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3 text-sm leading-relaxed text-[var(--text)]">
                    <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/20 text-[0.62rem] font-semibold text-emerald-100">
                      +
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <p className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-[var(--text)]">
                {landingCopy.calendarFeature.structureProof}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <TrackedCtaLink
                  href="/demo"
                  tracking={{
                    id: "landing_calendar_demo",
                    location: "calendar_feature",
                    target: "/demo",
                  }}
                  className="inline-flex rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
                >
                  {landingCopy.calendarFeature.primaryCta}
                </TrackedCtaLink>
                <TrackedCtaLink
                  href="/login?mode=signup"
                  tracking={{
                    id: "landing_calendar_signup",
                    location: "calendar_feature",
                    target: "/login?mode=signup",
                  }}
                  className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 active:scale-[0.98]"
                >
                  {landingCopy.calendarFeature.secondaryCta}
                </TrackedCtaLink>
              </div>
            </div>

            <div className="relative pb-8 pt-2 lg:-mr-20 xl:-mr-28" data-reveal-item>
              <figure className="relative z-20 w-[92%] overflow-hidden rounded-[24px] border border-white/20 bg-white/70 shadow-[0_24px_56px_rgba(15,23,42,0.2)]">
                <Image
                  src={calendarCoachImageSrc}
                  alt="Vue calendrier coach dans SwingFlow"
                  width={1560}
                  height={960}
                  className="h-auto w-full"
                />
              </figure>

              <figure className="absolute -bottom-2 right-0 z-30 w-[52%] overflow-hidden rounded-[20px] border border-white/25 bg-white/75 shadow-[0_18px_40px_rgba(15,23,42,0.2)] lg:right-4">
                <Image
                  src={calendarStudentImageSrc}
                  alt="Vue calendrier élève dans SwingFlow"
                  width={960}
                  height={1600}
                  className="h-auto w-full"
                />
              </figure>
            </div>
          </div>
        </section>

        <section
          className="reveal relative overflow-visible rounded-[30px] border border-white/15 bg-gradient-to-br from-white/75 via-white/45 to-emerald-100/40 p-8 shadow-[0_20px_56px_rgba(15,23,42,0.12)] md:p-10"
          data-reveal-stagger
        >
          <div className="pointer-events-none absolute -left-16 top-8 h-44 w-44 rounded-full bg-emerald-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-12 bottom-2 h-52 w-52 rounded-full bg-sky-300/20 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-5 lg:pr-2" data-reveal-item>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Gestion des groupes
              </p>
              <h2 className="text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
                {landingCopy.groupManagement.title}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
                {landingCopy.groupManagement.subtitle}
              </p>

              <ul className="space-y-3">
                {landingCopy.groupManagement.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-3 text-sm leading-relaxed text-[var(--text)]"
                  >
                    <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-300/50 bg-sky-300/20 text-[0.62rem] font-semibold text-sky-900">
                      +
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <p className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-[var(--text)]">
                {landingCopy.groupManagement.proof}
              </p>
            </div>

            <div
              className="relative -mb-4 sm:-mb-6 md:-mb-10 md:-mr-8 lg:-mr-14 lg:translate-y-2 lg:-mb-16"
              data-reveal-item
            >
              <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl" />
              <div className="pointer-events-none absolute -left-1 top-4 h-32 w-32 rounded-full bg-emerald-300/15 blur-3xl" />
              <a
                href={groupManagementImageSrc}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Voir la capture de gestion de groupe en pleine taille"
                className="group relative z-20 block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                <figure className="w-full max-w-none overflow-hidden rounded-2xl border border-white/20 bg-white/75 p-1 shadow-[0_20px_44px_rgba(15,23,42,0.22)] transition-transform duration-200 md:w-[132%] lg:w-[156%] lg:-translate-x-6 xl:w-[166%] group-hover:scale-[1.01]">
                  <Image
                    src={groupManagementImageSrc}
                    alt="Vue de la gestion de groupe et sous-groupe dans SwingFlow"
                    width={1600}
                    height={1000}
                    className="h-auto w-full"
                    priority={false}
                  />
                </figure>
                <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-slate-900 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                  Cliquer pour agrandir
                </span>
              </a>
            </div>
          </div>
        </section>
        <section className="reveal relative overflow-hidden" data-reveal-stagger>
          <div className="max-w-3xl space-y-6" data-reveal-item>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Problèmes
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
                {landingCopy.problems.title}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
                {landingCopy.problems.subtitle}
              </p>
              <p className="mt-6 max-w-xl text-sm font-medium text-[var(--text)]">
                {landingCopy.problems.proof}
              </p>

              <ol className="mt-2 space-y-3">
                {landingCopy.problems.bullets.map((bullet, index) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-4 rounded-2xl border border-white/15 bg-white/10 px-4 py-3"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <p className="pt-0.5 text-sm leading-relaxed text-[var(--text)]">{bullet}</p>
                  </li>
                ))}
              </ol>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[0.66rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full bg-amber-400/80 animate-pulse" />
                Temps perdu en préparation
              </div>
          </div>
        </section>

        <section
          className="reveal relative overflow-visible rounded-[34px] border border-white/20 bg-gradient-to-br from-emerald-100/60 via-white/65 to-sky-100/55 px-8 py-10 shadow-[0_24px_60px_rgba(15,23,42,0.1)] md:px-10"
          data-reveal-stagger
        >
          <div className="pointer-events-none absolute -left-16 top-6 h-40 w-40 rounded-full bg-emerald-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-8 bottom-2 h-48 w-48 rounded-full bg-sky-300/25 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.9fr]">
            <div data-reveal-item>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-600">Solution</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
                {landingCopy.solution.title}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-700">
                {landingCopy.solution.subtitle}
              </p>

              <ul className="mt-7 space-y-3 text-sm text-slate-800">
                {landingCopy.solution.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
                      +
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <TrackedCtaLink
                  href="/login?mode=signup"
                  tracking={{
                    id: "landing_solution_signup",
                    location: "solution",
                    target: "/login?mode=signup",
                  }}
                  className="inline-flex rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 active:scale-[0.98]"
                >
                  {landingCopy.solution.primaryCta}
                </TrackedCtaLink>
                <TrackedCtaLink
                  href="/login?mode=signin"
                  tracking={{
                    id: "landing_solution_signin",
                    location: "solution",
                    target: "/login?mode=signin",
                  }}
                  className="rounded-full border border-slate-900/20 bg-white/70 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-white active:scale-[0.98]"
                >
                  {landingCopy.solution.secondaryCta}
                </TrackedCtaLink>
              </div>
            </div>

            <div className="relative py-2 lg:-mr-24 xl:-mr-32" data-reveal-item>
              <div className="pointer-events-none absolute -inset-x-6 -inset-y-8 rounded-[40px] bg-gradient-to-br from-white/70 via-white/30 to-transparent" />
              <div className="pointer-events-none absolute -left-14 top-10 h-44 w-44 rounded-full bg-emerald-300/30 blur-3xl" />
              <div className="pointer-events-none absolute -right-16 bottom-8 h-56 w-56 rounded-full bg-sky-300/30 blur-3xl" />
              <Image
                src={dashboardOverviewImageSrc}
                alt="Dashboard élève SwingFlow"
                width={1720}
                height={1024}
                priority
                className="relative z-10 h-auto w-full rounded-xl drop-shadow-[0_34px_80px_rgba(15,23,42,0.28)] lg:w-[128%] lg:max-w-none lg:-ml-8"
              />
            </div>
          </div>
        </section>

        <section
          id="fonctionnalites"
          className="reveal scroll-mt-28"
          data-reveal-stagger
        >
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="lg:sticky lg:top-28 lg:self-start" data-reveal-item>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Fonctionnalités
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
                {landingCopy.features.title}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                Moins de friction entre vos outils, plus de continuité dans vos décisions.
              </p>

              <div className="mt-8 flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4">
                <div className="h-14 w-14">
                  <SectionsReadyIllustration />
                </div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Workflow stable, coaching vivant
                </p>
              </div>
            </div>

            <ol className="space-y-8">
              {landingCopy.features.items.map((item, index) => (
                <li
                  key={item.title}
                  className={`relative pl-12 ${index % 2 === 1 ? "lg:translate-x-8" : ""}`}
                  data-reveal-item
                >
                  <span className="absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/75 text-xs font-semibold text-slate-700">
                    {index + 1}
                  </span>
                  <h3 className="text-xl font-semibold text-[var(--text)]">{item.title}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                    {item.description}
                  </p>
                  <span className="mt-3 block h-px w-24 bg-gradient-to-r from-emerald-400/60 to-transparent" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="reveal relative overflow-hidden" data-reveal-stagger>
          <div className="max-w-3xl" data-reveal-item>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Bénéfices</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
              {landingCopy.benefits.title}
            </h2>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <article
              className="rounded-[28px] border border-rose-300/30 bg-gradient-to-b from-rose-100/35 via-white/45 to-white/35 p-6"
              data-reveal-item
            >
              <p className="text-xs uppercase tracking-[0.22em] text-rose-700">Avant</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {landingCopy.benefits.rows.map((row) => (
                  <li key={row.before} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/80 text-xs font-semibold text-white">
                      x
                    </span>
                    <span>{row.before}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article
              className="rounded-[28px] border border-emerald-300/35 bg-gradient-to-b from-emerald-100/45 via-white/45 to-white/35 p-6"
              data-reveal-item
            >
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-700">Après</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-800">
                {landingCopy.benefits.rows.map((row) => (
                  <li key={row.after} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
                      +
                    </span>
                    <span>{row.after}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="reveal" data-reveal-stagger>
          <div className="max-w-3xl" data-reveal-item>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              Cas d&apos;usage
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
              {landingCopy.useCases.title}
            </h2>
          </div>

          <figure className="relative mt-8 overflow-visible" data-reveal-item>
            <div className="pointer-events-none absolute -left-14 top-8 h-36 w-36 rounded-full bg-emerald-300/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-12 bottom-0 h-40 w-40 rounded-full bg-sky-300/20 blur-3xl" />
            <Image
              src={coachDashboardImageSrc}
              alt="Dashboard coach SwingFlow pour piloter les cas d'usage indépendant et structure"
              width={1700}
              height={950}
              className="relative h-auto w-full rounded-[24px] border border-white/20 bg-white/70 shadow-[0_20px_48px_rgba(15,23,42,0.16)] lg:w-[108%] lg:max-w-none lg:-ml-8"
            />
          </figure>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <article
              className="relative overflow-hidden rounded-[30px] border border-white/20 bg-gradient-to-br from-white/65 via-white/45 to-emerald-100/35 p-7"
              data-reveal-item
            >
              <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-emerald-300/25 blur-3xl" />
              <h3 className="relative text-xl font-semibold text-slate-900">
                {landingCopy.useCases.coachIndependent.title}
              </h3>
              <ul className="relative mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
                {landingCopy.useCases.coachIndependent.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>

            <article
              className="relative overflow-hidden rounded-[30px] border border-white/20 bg-gradient-to-br from-white/65 via-white/45 to-sky-100/35 p-7"
              data-reveal-item
            >
              <div className="pointer-events-none absolute -left-8 -bottom-12 h-36 w-36 rounded-full bg-sky-300/25 blur-3xl" />
              <h3 className="relative text-xl font-semibold text-slate-900">
                {landingCopy.useCases.structure.title}
              </h3>
              <ul className="relative mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
                {landingCopy.useCases.structure.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        {showSocialProof ? (
          <section className="reveal" data-reveal-stagger>
            <div className="max-w-3xl" data-reveal-item>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Preuve sociale
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
                {landingCopy.socialProof.title}
              </h2>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {landingCopy.socialProof.testimonials.map((testimonial, index) => (
                <div key={testimonial.quote} data-reveal-item>
                  <Testimonial
                    {...testimonial}
                    tone={index === 1 ? "sky" : index === 2 ? "amber" : "emerald"}
                  />
                </div>
              ))}
            </div>

            <div
              className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-b border-white/10 py-4 text-xs uppercase tracking-[0.24em] text-[var(--muted)]"
              data-reveal-item
            >
              {landingCopy.socialProof.logos.map((logo, index) => (
                <span key={logo} className="inline-flex items-center gap-4">
                  {index > 0 ? <span className="opacity-40">/</span> : null}
                  <span>{logo}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section
          id="pricing"
          className="reveal scroll-mt-28"
          data-reveal-stagger
        >
          <div className="mx-auto max-w-3xl text-center" data-reveal-item>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Tarifs</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
              {landingCopy.pricing.title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
              {landingCopy.pricing.subtitle}
            </p>
          </div>

          <div className="mt-8" data-reveal-item>
            <PricingOffersContent
              variant="marketing"
              plans={pricingPlans}
              error={pricingPlansError ?? ""}
            />
          </div>
        </section>

        <section
          id="faq"
          className="reveal scroll-mt-28"
          data-reveal-stagger
        >
          <div className="max-w-3xl" data-reveal-item>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--text)] md:text-4xl">
              {landingCopy.faq.title}
            </h2>
          </div>

          <div className="mt-8 border-y border-white/10" data-reveal-item>
            {landingCopy.faq.items.map((item, index) => (
              <details
                key={item.question}
                className={`group py-4 ${index > 0 ? "border-t border-white/10" : ""}`}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-semibold text-[var(--text)]">
                  <span>{item.question}</span>
                  <span className="text-[var(--muted)] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="reveal relative overflow-hidden rounded-[34px] border border-white/20 bg-gradient-to-r from-slate-900/90 via-slate-800/90 to-emerald-900/80 p-8 text-white shadow-[0_26px_60px_rgba(15,23,42,0.35)] md:p-10"
          data-reveal-stagger
        >
          <div className="pointer-events-none absolute -left-20 -bottom-24 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />

          <div className="relative" data-reveal-item>
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight md:text-4xl">
              {landingCopy.finalCta.title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">
              {landingCopy.finalCta.subtitle}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <TrackedCtaLink
                href="/login?mode=signup"
                tracking={{
                  id: "landing_final_signup",
                  location: "final_cta",
                  target: "/login?mode=signup",
                }}
                className="inline-flex rounded-full bg-white px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-900 transition hover:bg-white/90 active:scale-[0.98]"
              >
                {landingCopy.finalCta.primaryCta}
              </TrackedCtaLink>
              <TrackedCtaLink
                href="/login?mode=signin"
                tracking={{
                  id: "landing_final_signin",
                  location: "final_cta",
                  target: "/login?mode=signin",
                }}
                className="rounded-full border border-white/35 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 active:scale-[0.98]"
              >
                {landingCopy.finalCta.secondaryCta}
              </TrackedCtaLink>
            </div>
          </div>
        </section>

        <footer className="pt-10 text-xs text-[var(--muted)]">
          <div className="mx-auto max-w-6xl border-t border-white/10 pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p>(c)2026 SwingFlow - Tous droits réservés</p>
              <nav aria-label="Liens légaux" className="flex flex-wrap gap-x-2 gap-y-1">
                <Link href="/mentions-legales" className="transition hover:text-[var(--text)]">
                  Mentions légales
                </Link>
                <span aria-hidden="true">-</span>
                <Link href="/cgv" className="transition hover:text-[var(--text)]">
                  CGV
                </Link>
                <span aria-hidden="true">-</span>
                <Link href="/cgu" className="transition hover:text-[var(--text)]">
                  CGU
                </Link>
                <span aria-hidden="true">-</span>
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

