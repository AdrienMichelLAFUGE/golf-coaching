"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";

type LightboxImage = {
  url: string;
  alt?: string | null;
  caption?: string | null;
};

type MediaLightboxProps = {
  image: LightboxImage | null;
  onClose: () => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const STEP_ZOOM = 0.25;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export default function MediaLightbox({ image, onClose }: MediaLightboxProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!image) return;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [image, onClose]);

  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setZoom((prev) => clampZoom(prev - STEP_ZOOM))}
            disabled={zoom <= MIN_ZOOM}
            className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs uppercase tracking-wide text-white/90 transition hover:bg-black/60 disabled:opacity-40"
          >
            Zoom -
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs uppercase tracking-wide text-white/90 transition hover:bg-black/60"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            onClick={() => setZoom((prev) => clampZoom(prev + STEP_ZOOM))}
            disabled={zoom >= MAX_ZOOM}
            className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs uppercase tracking-wide text-white/90 transition hover:bg-black/60 disabled:opacity-40"
          >
            Zoom +
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs uppercase tracking-wide text-white/90 transition hover:bg-black/60"
          >
            Fermer
          </button>
        </div>

        <div className="relative flex-1 overflow-auto rounded-2xl border border-white/15 bg-black/60">
          <div className="flex min-h-full min-w-full items-center justify-center p-4">
            <img
              src={image.url}
              alt={image.alt ?? "Image du rapport"}
              className="max-h-[85vh] max-w-full select-none object-contain"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
              draggable={false}
            />
          </div>
          {image.caption?.trim() ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-5 pt-12 text-sm text-white">
              {image.caption}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
