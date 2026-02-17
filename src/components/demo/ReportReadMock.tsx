import Image from "next/image";
import FZChart from "./FZChart";
import type {
  AiSuggestion,
  DemoMediaFixture,
  DemoReport,
  Smart2MoveFixture,
} from "./fixtures";

type ReportReadMockProps = {
  studentName: string;
  report: DemoReport;
  axis: AiSuggestion | null;
  media: DemoMediaFixture;
  smart2move: Smart2MoveFixture;
};

export default function ReportReadMock({
  studentName,
  report,
  axis,
  media,
  smart2move,
}: ReportReadMockProps) {
  const mainImage = media.imageGallery[0];
  const secondaryImage = media.imageGallery[1] ?? media.imageGallery[0];
  const formattedSections =
    axis?.sectionPayload.map((entry) => ({
      title: entry.section,
      content: entry.value,
    })) ?? [
      { title: "Résumé de séance", content: report.constat },
      { title: "Diagnostic swing", content: report.axeTravail },
      { title: "Plan 7 jours", content: "2 blocs techniques + 1 validation parcours." },
    ];

  return (
    <div className="grid h-full w-full gap-4 lg:grid-cols-[1.06fr_0.94fr]">
      <article className="space-y-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4">
        <header className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Rapport publié</p>
            <h3 className="mt-1 text-base font-semibold text-[var(--text)]">{studentName}</h3>
          </div>
          <span className="rounded-full border border-emerald-300/45 bg-emerald-400/15 px-2.5 py-1 text-[0.63rem] font-semibold uppercase tracking-[0.2em] text-emerald-100">
            Lecture
          </span>
        </header>

        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-3">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-emerald-100">Synthèse séance</p>
          <p className="mt-1 text-sm text-[var(--text)]">
            <span className="font-semibold">Club:</span> {report.club} ·{" "}
            <span className="font-semibold">Constat:</span> {report.constat}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
            <span className="font-semibold">Axe principal:</span> {report.axeTravail}
          </p>
        </div>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Sections publiées
          </h4>
          <div className="space-y-2">
            {formattedSections.map((section, index) => (
              <article
                key={`${section.title}-${index}`}
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-3"
              >
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {section.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">{section.content}</p>
              </article>
            ))}
          </div>
        </section>

        {axis ? (
          <section className="rounded-xl border border-sky-300/30 bg-sky-400/10 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
              Axe IA retenu
            </h4>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">{axis.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text)]">{axis.readyText}</p>
          </section>
        ) : null}
      </article>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/15 bg-slate-900/45 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            {mainImage?.label}
          </p>
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
            {mainImage ? (
              <Image
                src={mainImage.src}
                alt={mainImage.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 520px"
                className="object-cover"
              />
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-slate-900/45 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {media.videoScene.thumb.label}
            </p>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
              <Image
                src={media.videoScene.thumb.src}
                alt={media.videoScene.thumb.alt}
                fill
                sizes="(max-width: 1024px) 50vw, 250px"
                className="object-cover"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-slate-900/45 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {secondaryImage?.label}
            </p>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
              {secondaryImage ? (
                <Image
                  src={secondaryImage.src}
                  alt={secondaryImage.alt}
                  fill
                  sizes="(max-width: 1024px) 50vw, 250px"
                  className="object-cover"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-slate-900/45 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Smart2Move — Force Zone
          </p>
          <FZChart smart2move={smart2move} animate={false} showSeriesOverlay={false} />
        </div>
      </aside>
    </div>
  );
}
