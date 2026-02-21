import Image from "next/image";
import type { DemoMediaAsset } from "./fixtures";
import styles from "./demo.module.css";

type VideoStudioMockProps = {
  thumb: DemoMediaAsset;
  mobilePreview: DemoMediaAsset;
  ready: boolean;
  onMarkReady: () => void;
};

export default function VideoStudioMock({
  thumb,
  mobilePreview,
  ready,
  onMarkReady,
}: VideoStudioMockProps) {
  const actionButtonClass = `${styles.ctaPulseSoft} inline-flex items-center justify-center rounded-full border border-sky-200/65 bg-gradient-to-r from-sky-200 via-cyan-100 to-emerald-100 px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-900 shadow-[0_10px_28px_rgba(56,189,248,0.28)] transition-all duration-300 hover:brightness-105 hover:shadow-[0_14px_36px_rgba(14,165,233,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/75`;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.42fr]">
      <article className="rounded-2xl border border-white/12 bg-white/8 p-3">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/12">
          <Image
            src={thumb.src}
            alt={thumb.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 840px"
            className="object-cover"
          />
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-white/95">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            Clip principal
          </span>
        </div>
        <p className="mt-2 text-sm font-medium text-[var(--text)]">{thumb.label}</p>
      </article>

      <aside className="flex flex-col gap-3 rounded-2xl border border-white/12 bg-white/8 p-3">
        <div className="relative mx-auto aspect-[10/18] w-full max-w-[180px] overflow-hidden rounded-xl border border-white/12">
          <Image
            src={mobilePreview.src}
            alt={mobilePreview.alt}
            fill
            sizes="180px"
            className="object-cover"
          />
        </div>
        <p className="text-xs text-[var(--muted)]">{mobilePreview.label}</p>
        <button
          type="button"
          onClick={onMarkReady}
          className={actionButtonClass}
        >
          {ready ? "Vidéo prête" : "Ajouter la vidéo"}
        </button>
      </aside>
    </div>
  );
}
