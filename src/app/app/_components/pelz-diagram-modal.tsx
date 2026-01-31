"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  PELZ_DIAGRAM_BUCKET,
  PELZ_DIAGRAM_EXTENSION,
} from "@/lib/normalized-tests/pelz-diagrams";

type PelzDiagramModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  alt: string;
  diagramKey: string | null;
  bucket?: string;
  extension?: string;
};

const buildDiagramPath = (diagramKey: string, extension: string) =>
  `${diagramKey}.${extension}`;

export default function PelzDiagramModal({
  open,
  onClose,
  title,
  alt,
  diagramKey,
  bucket,
  extension,
}: PelzDiagramModalProps) {
  const titleId = useId();
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const storageBucket = bucket ?? PELZ_DIAGRAM_BUCKET;
  const storageExtension = extension ?? PELZ_DIAGRAM_EXTENSION;
  const { diagramUrl, urlError } = useMemo(() => {
    if (!open || !diagramKey) return { diagramUrl: null, urlError: "" };
    const { data } = supabase.storage
      .from(storageBucket)
      .getPublicUrl(buildDiagramPath(diagramKey, storageExtension));
    return {
      diagramUrl: data.publicUrl ?? null,
      urlError: "",
    };
  }, [diagramKey, open, storageBucket, storageExtension]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const hasError = Boolean(urlError) || (diagramKey ? failedKey === diagramKey : false);
  const isLoading =
    Boolean(diagramKey) && !hasError && diagramUrl && loadedKey !== diagramKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] md:w-[86vw] md:max-w-[86vw]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6 md:py-4">
          <h3
            id={titleId}
            className="text-sm font-semibold text-[var(--text)] md:text-lg"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
            aria-label="Fermer"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-auto p-4 md:p-6">
          {isLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--muted)]">
              Chargement du schema...
            </div>
          ) : null}
          {hasError ? (
            <div className="flex min-h-[30vh] items-center justify-center text-sm text-red-300">
              {urlError || "Schema indisponible."}
            </div>
          ) : null}
          {!hasError && diagramUrl ? (
            <img
              src={diagramUrl}
              alt={alt}
              className={`mx-auto h-auto max-h-[80vh] w-full max-w-[86vw] rounded-2xl object-contain ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={() => {
                if (diagramKey) {
                  setLoadedKey(diagramKey);
                }
              }}
              onError={() => {
                if (diagramKey) {
                  setFailedKey(diagramKey);
                }
              }}
            />
          ) : null}
          {!isLoading && !hasError && !diagramUrl ? (
            <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--muted)]">
              Schema indisponible.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
