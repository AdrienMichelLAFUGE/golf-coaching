import Image from "next/image";
import type { DemoMediaAsset } from "./fixtures";

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
          className="rounded-full border border-sky-300/50 bg-sky-400/15 px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sky-100 transition hover:bg-sky-400/25"
        >
          {ready ? "Vidéo prête" : "Ajouter la vidéo"}
        </button>
      </aside>
    </div>
  );
}
