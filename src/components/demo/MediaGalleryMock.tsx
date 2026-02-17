"use client";

import Image from "next/image";
import { useState } from "react";
import type { DemoMediaAsset } from "./fixtures";

type MediaGalleryMockProps = {
  assets: DemoMediaAsset[];
  ready: boolean;
  onMarkReady: () => void;
};

export default function MediaGalleryMock({
  assets,
  ready,
  onMarkReady,
}: MediaGalleryMockProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedAsset = assets[selectedIndex] ?? assets[0] ?? null;

  if (!selectedAsset) {
    return (
      <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-[var(--muted)]">
        Aucune image de démo disponible.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <article className="rounded-2xl border border-white/12 bg-white/8 p-3">
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-white/12">
          <Image
            src={selectedAsset.src}
            alt={selectedAsset.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 920px"
            className="object-cover"
          />
        </div>
        <p className="mt-2 text-sm font-medium text-[var(--text)]">{selectedAsset.label}</p>
      </article>

      <aside className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {assets.map((asset, index) => (
            <button
              key={asset.src}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative overflow-hidden rounded-xl border transition ${
                index === selectedIndex
                  ? "border-emerald-300/55 ring-1 ring-emerald-300/35"
                  : "border-white/12 hover:border-white/25"
              }`}
            >
              <div className="relative h-20 w-28 lg:h-20 lg:w-36">
                <Image
                  src={asset.src}
                  alt={asset.alt}
                  fill
                  sizes="140px"
                  className="object-cover"
                />
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onMarkReady}
          className="rounded-full border border-emerald-300/50 bg-emerald-400/15 px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-400/25"
        >
          {ready ? "Image ajoutée au rapport" : "Ajouter l’image au rapport"}
        </button>
      </aside>
    </div>
  );
}
