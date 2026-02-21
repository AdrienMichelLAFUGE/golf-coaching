"use client";

import Image from "next/image";
import { useState } from "react";
import type { DemoMediaAsset } from "./fixtures";
import styles from "./demo.module.css";

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
  const actionButtonClass = `${styles.ctaPulse} inline-flex items-center justify-center rounded-full border border-emerald-200/70 bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-900 shadow-[0_10px_28px_rgba(16,185,129,0.34)] transition-all duration-300 hover:brightness-105 hover:shadow-[0_14px_36px_rgba(56,189,248,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/75`;
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
          className={actionButtonClass}
        >
          {ready ? "Image ajoutée au rapport" : "Ajouter l’image au rapport"}
        </button>
      </aside>
    </div>
  );
}
