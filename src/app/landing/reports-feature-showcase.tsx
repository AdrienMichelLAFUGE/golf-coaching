import ContentCustomizableIllustration from "./illustrations/ContentCustomizableIllustration";
import DataDrivenAiIllustration from "./illustrations/DataDrivenAiIllustration";
import SectionAwareAiIllustration from "./illustrations/SectionAwareAiIllustration";
import SectionsReadyIllustration from "./illustrations/SectionsReadyIllustration";
import TrainingPlanIllustration from "./illustrations/TrainingPlanIllustration";

const cards = [
  {
    title: "Sections prêtes à l'emploi",
    description:
      "Construisez vos rapports à partir de sections structurées et réutilisables.",
    Illustration: SectionsReadyIllustration,
  },
  {
    title: "Contenu personnalisable",
    description:
      "Adaptez chaque section à votre méthode, à chaque séance et à chaque élève.",
    Illustration: ContentCustomizableIllustration,
  },
  {
    title: "IA consciente des sections",
    description:
      "L'assistant comprend la structure du rapport et agit section par section.",
    Illustration: SectionAwareAiIllustration,
  },
  {
    title: "IA basée sur vos données",
    description:
      "L'IA s'appuie sur le profil TPI et les données radar pour recommander.",
    Illustration: DataDrivenAiIllustration,
  },
  {
    title: "Plan d'entraînement personnalisé",
    description:
      "Ajoutez une section de planification pour générer un plan adapté à l'élève.",
    Illustration: TrainingPlanIllustration,
  },
] as const;

export default function ReportsFeatureShowcase() {
  return (
    <section
      className="reveal rounded-3xl p-8 md:p-10 lg:ml-auto lg:max-w-[100%]"
      data-reveal-stagger
    >
      <div className="max-w-2xl" data-reveal-item>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)] md:text-3xl">
          Rapports & IA
        </h2>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Des rapports clairs, relus et enrichis par l&apos;IA, sans perdre votre méthode.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {cards.map((card, index) => {
          const Illustration = card.Illustration;
          const isLast = index === cards.length - 1;
          return (
            <article
              key={card.title}
              className={`rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.18)] ${
                isLast ? "md:col-span-2 md:mx-auto md:max-w-[520px]" : ""
              }`}
              data-reveal-item
            >
              <div className="flex h-40 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4">
                <Illustration />
              </div>
              <h3 className="mt-5 text-base font-semibold text-[var(--text)]">
                {card.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{card.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
