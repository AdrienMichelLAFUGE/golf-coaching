"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RoleGuard from "../../../_components/role-guard";
import PelzResponsiveAccordion from "../../../_components/pelz-responsive-accordion";
import PelzDiagramModal from "../../../_components/pelz-diagram-modal";
import {
  PELZ_DIAGRAM_ALT_TEXT,
  PELZ_DIAGRAM_BY_SUBTEST,
} from "@/lib/normalized-tests/pelz-diagrams";
import {
  PELZ_PUTTING_TEST,
  PELZ_PUTTING_SLUG,
  type PelzResultValue,
  type PelzSubtestKey,
  computePelzSubtestScore,
  computePelzTotalIndex,
  getPelzResultLabel,
} from "@/lib/normalized-tests/pelz-putting";
import {
  PELZ_APPROCHES_DIAGRAM_ALT_TEXT,
  PELZ_APPROCHES_DIAGRAM_BUCKET,
  PELZ_APPROCHES_DIAGRAM_BY_SUBTEST,
  PELZ_APPROCHES_DIAGRAM_EXTENSION,
} from "@/lib/normalized-tests/pelz-approches-diagrams";
import {
  PELZ_APPROCHES_TEST,
  PELZ_APPROCHES_SLUG,
  type PelzApprochesResultValue,
  type PelzApprochesSubtestKey,
  computePelzApprochesSubtestScore,
  computePelzApprochesTotalIndex,
  getPelzApprochesResultLabel,
} from "@/lib/normalized-tests/pelz-approches";
import {
  WEDGING_DRAPEAU_LONG_DIAGRAM_ALT_TEXT,
  WEDGING_DRAPEAU_LONG_DIAGRAM_BUCKET,
  WEDGING_DRAPEAU_LONG_DIAGRAM_EXTENSION,
  WEDGING_DRAPEAU_LONG_DIAGRAM_KEY,
} from "@/lib/normalized-tests/wedging-drapeau-long-diagrams";
import {
  WEDGING_DRAPEAU_LONG_SEQUENCE,
  WEDGING_DRAPEAU_LONG_SLUG,
  WEDGING_DRAPEAU_LONG_TEST,
  type WedgingDrapeauLongResultValue,
  computeWedgingDrapeauLongObjectivation,
  computeWedgingDrapeauLongTotalScore,
  getWedgingDrapeauLongResultLabel,
} from "@/lib/normalized-tests/wedging-drapeau-long";
import {
  WEDGING_DRAPEAU_COURT_DIAGRAM_ALT_TEXT,
  WEDGING_DRAPEAU_COURT_DIAGRAM_BUCKET,
  WEDGING_DRAPEAU_COURT_DIAGRAM_EXTENSION,
  WEDGING_DRAPEAU_COURT_DIAGRAM_KEY,
} from "@/lib/normalized-tests/wedging-drapeau-court-diagrams";
import {
  WEDGING_DRAPEAU_COURT_SEQUENCE,
  WEDGING_DRAPEAU_COURT_SLUG,
  WEDGING_DRAPEAU_COURT_TEST,
  type WedgingDrapeauCourtResultValue,
  computeWedgingDrapeauCourtObjectivation,
  computeWedgingDrapeauCourtTotalScore,
  getWedgingDrapeauCourtResultLabel,
} from "@/lib/normalized-tests/wedging-drapeau-court";

type PreviewProps = {
  onBack: () => void;
};

type PelzAttemptsBySubtest = Record<PelzSubtestKey, Array<PelzResultValue | null>>;
type PelzApprochesAttemptsBySubtest = Record<
  PelzApprochesSubtestKey,
  Array<PelzApprochesResultValue | null>
>;

const createEmptyPelzAttempts = (): PelzAttemptsBySubtest => {
  const entries = PELZ_PUTTING_TEST.subtests.map((subtest) => [
    subtest.key,
    Array(PELZ_PUTTING_TEST.attemptsPerSubtest).fill(
      null
    ) as Array<PelzResultValue | null>,
  ]);
  return Object.fromEntries(entries) as PelzAttemptsBySubtest;
};

const createEmptyPelzApprochesAttempts = (): PelzApprochesAttemptsBySubtest => {
  const entries = PELZ_APPROCHES_TEST.subtests.map((subtest) => [
    subtest.key,
    Array(PELZ_APPROCHES_TEST.attemptsPerSubtest).fill(
      null
    ) as Array<PelzApprochesResultValue | null>,
  ]);
  return Object.fromEntries(entries) as PelzApprochesAttemptsBySubtest;
};

const pelzDistanceLabelByKey: Record<PelzSubtestKey, string> = {
  putt_long: "A=13m, B=19m, C=25m",
  putt_moyen: "A=7m, B=9m, C=11m",
  putt_pente: "A=4m, B=6m, C=8m, D=10m, E=12m",
  putt_offensif: "A=3m, B=4m, C=5m, D=6m, E=7m",
  putt_court_1m: "A=1m, B=1m, C=1m, D=1m, E=1m",
  putt_court_2m: "A=2m, B=2m, C=2m, D=2m, E=2m",
};

const pelzDistanceItemsByKey: Record<
  PelzSubtestKey,
  { slot: string; distance: string }[]
> = {
  putt_long: [
    { slot: "A", distance: "13m" },
    { slot: "B", distance: "19m" },
    { slot: "C", distance: "25m" },
  ],
  putt_moyen: [
    { slot: "A", distance: "7m" },
    { slot: "B", distance: "9m" },
    { slot: "C", distance: "11m" },
  ],
  putt_pente: [
    { slot: "A", distance: "4m" },
    { slot: "B", distance: "6m" },
    { slot: "C", distance: "8m" },
    { slot: "D", distance: "10m" },
    { slot: "E", distance: "12m" },
  ],
  putt_offensif: [
    { slot: "A", distance: "3m" },
    { slot: "B", distance: "4m" },
    { slot: "C", distance: "5m" },
    { slot: "D", distance: "6m" },
    { slot: "E", distance: "7m" },
  ],
  putt_court_1m: [
    { slot: "A", distance: "1m" },
    { slot: "B", distance: "1m" },
    { slot: "C", distance: "1m" },
    { slot: "D", distance: "1m" },
    { slot: "E", distance: "1m" },
  ],
  putt_court_2m: [
    { slot: "A", distance: "2m" },
    { slot: "B", distance: "2m" },
    { slot: "C", distance: "2m" },
    { slot: "D", distance: "2m" },
    { slot: "E", distance: "2m" },
  ],
};

const pelzSlotColorClassByLetter: Record<string, string> = {
  A: "text-sky-300",
  B: "text-amber-300",
  C: "text-emerald-300",
  D: "text-violet-300",
  E: "text-rose-300",
};

const getPelzDistanceForSlot = (key: PelzSubtestKey, slot: string) =>
  pelzDistanceItemsByKey[key]?.find((item) => item.slot === slot)?.distance ?? "";

const pelzApprochesDistanceLabelByKey: Record<PelzApprochesSubtestKey, string> = {
  approche_levee: "A=15m, B=20m, C=10m",
  chip_long: "A=15m, B=20m, C=10m",
  chip_court: "A=15m, B=20m, C=10m",
  wedging_50m: "D=50m, E=10m, F=30m",
  bunker_court: "D=50m, E=10m, F=30m",
  wedging_30m: "D=50m, E=10m, F=30m",
  bunker_long: "G=25m, H=20m, I=15m",
  approche_mi_distance: "G=25m, H=20m, I=15m",
  approche_rough: "G=25m, H=20m, I=15m",
};

const pelzApprochesDistanceItemsByKey: Record<
  PelzApprochesSubtestKey,
  { slot: string; distance: string }[]
> = {
  approche_levee: [
    { slot: "A", distance: "15m" },
    { slot: "B", distance: "20m" },
    { slot: "C", distance: "10m" },
  ],
  chip_long: [
    { slot: "A", distance: "15m" },
    { slot: "B", distance: "20m" },
    { slot: "C", distance: "10m" },
  ],
  chip_court: [
    { slot: "A", distance: "15m" },
    { slot: "B", distance: "20m" },
    { slot: "C", distance: "10m" },
  ],
  wedging_50m: [
    { slot: "D", distance: "50m" },
    { slot: "E", distance: "10m" },
    { slot: "F", distance: "30m" },
  ],
  bunker_court: [
    { slot: "D", distance: "50m" },
    { slot: "E", distance: "10m" },
    { slot: "F", distance: "30m" },
  ],
  wedging_30m: [
    { slot: "D", distance: "50m" },
    { slot: "E", distance: "10m" },
    { slot: "F", distance: "30m" },
  ],
  bunker_long: [
    { slot: "G", distance: "25m" },
    { slot: "H", distance: "20m" },
    { slot: "I", distance: "15m" },
  ],
  approche_mi_distance: [
    { slot: "G", distance: "25m" },
    { slot: "H", distance: "20m" },
    { slot: "I", distance: "15m" },
  ],
  approche_rough: [
    { slot: "G", distance: "25m" },
    { slot: "H", distance: "20m" },
    { slot: "I", distance: "15m" },
  ],
};

const pelzApprochesSlotColorClassByLetter: Record<string, string> = {
  A: "text-sky-300",
  B: "text-amber-300",
  C: "text-emerald-300",
  D: "text-violet-300",
  E: "text-rose-300",
  F: "text-cyan-300",
  G: "text-teal-300",
  H: "text-orange-300",
  I: "text-fuchsia-300",
};

const getPelzApprochesDistanceForSlot = (key: PelzApprochesSubtestKey, slot: string) =>
  pelzApprochesDistanceItemsByKey[key]?.find((item) => item.slot === slot)?.distance ??
  "";

const wedgingSlotColorClassByLetter: Record<string, string> = {
  A: "text-sky-300",
  B: "text-amber-300",
  C: "text-emerald-300",
  D: "text-violet-300",
  E: "text-rose-300",
  F: "text-lime-300",
  G: "text-cyan-300",
  H: "text-fuchsia-300",
  I: "text-orange-300",
};

const getSlotColorClass = (slot: string, colors: Record<string, string>) =>
  colors[slot] ?? "text-[var(--muted)]";

const wedgingDistanceItems = [
  { slot: "A", distance: "30m" },
  { slot: "B", distance: "35m" },
  { slot: "C", distance: "40m" },
  { slot: "D", distance: "45m" },
  { slot: "E", distance: "50m" },
  { slot: "F", distance: "55m" },
  { slot: "G", distance: "60m" },
  { slot: "H", distance: "65m" },
  { slot: "I", distance: "70m" },
];

const wedgingDistanceBySlot = Object.fromEntries(
  wedgingDistanceItems.map((item) => [item.slot, item.distance])
) as Record<string, string>;

const renderWedgingDistanceLabel = () => (
  <span>
    {wedgingDistanceItems.map((item, index) => (
      <span key={item.slot}>
        <span
          className={`font-semibold ${getSlotColorClass(item.slot, wedgingSlotColorClassByLetter)}`}
        >
          {item.slot}
        </span>
        <span className={getSlotColorClass(item.slot, wedgingSlotColorClassByLetter)}>
          =
        </span>
        <span className={getSlotColorClass(item.slot, wedgingSlotColorClassByLetter)}>
          {item.distance}
        </span>
        {index < wedgingDistanceItems.length - 1 ? ", " : ""}
      </span>
    ))}
  </span>
);

const renderDistanceLabel = (
  key: string,
  itemsByKey: Record<string, { slot: string; distance: string }[]>,
  fallback: Record<string, string>,
  colors: Record<string, string>
) => {
  const items = itemsByKey[key] ?? [];
  if (!items.length) {
    return fallback[key] ?? "";
  }
  return (
    <span>
      {items.map((item, index) => (
        <span key={`${key}-${item.slot}`}>
          <span className={`font-semibold ${getSlotColorClass(item.slot, colors)}`}>
            {item.slot}
          </span>
          <span className={getSlotColorClass(item.slot, colors)}>=</span>
          <span className={getSlotColorClass(item.slot, colors)}>{item.distance}</span>
          {index < items.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  );
};

const formatScore = (value: number) => value.toFixed(1);

function PelzPuttingPreview({ onBack }: PreviewProps) {
  const [diagramSubtest, setDiagramSubtest] = useState<PelzSubtestKey | null>(null);
  const attempts = useMemo(() => createEmptyPelzAttempts(), []);
  const subtestScores = useMemo(
    () =>
      PELZ_PUTTING_TEST.subtests.map((subtest) => ({
        key: subtest.key,
        ...computePelzSubtestScore(subtest.key, attempts[subtest.key]),
      })),
    [attempts]
  );
  const totalPoints = subtestScores.reduce((acc, score) => acc + score.totalPoints, 0);
  const isComplete = subtestScores.every((score) => score.indexValue !== null);
  const totalIndex = isComplete ? computePelzTotalIndex(totalPoints) : null;
  const diagramMeta = useMemo(() => {
    if (!diagramSubtest) return null;
    const subtest = PELZ_PUTTING_TEST.subtests.find(
      (item) => item.key === diagramSubtest
    );
    return {
      title: subtest?.label ?? "Schema",
      alt: PELZ_DIAGRAM_ALT_TEXT[diagramSubtest],
      diagramKey: PELZ_DIAGRAM_BY_SUBTEST[diagramSubtest],
    };
  }, [diagramSubtest]);

  const summarySection = (
    <section className="panel-soft rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">Resume</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Apercu lecture seule du test.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Total points
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{totalPoints}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Index final: {totalIndex ?? "-"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {subtestScores.map((score) => (
          <div
            key={score.key}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {PELZ_PUTTING_TEST.subtests.find((s) => s.key === score.key)?.label}
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {score.totalPoints} pts
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Index: {score.indexValue ?? "-"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );

  const subtestItems = PELZ_PUTTING_TEST.subtests.map((subtest) => ({
    id: subtest.key,
    label: subtest.label,
    content: (
      <section className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">{subtest.label}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Distances:{" "}
              {renderDistanceLabel(
                subtest.key,
                pelzDistanceItemsByKey,
                pelzDistanceLabelByKey,
                pelzSlotColorClassByLetter
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDiagramSubtest(subtest.key)}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              aria-label={`Ouvrir schema ${subtest.label}`}
            >
              Schema
            </button>
            <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] opacity-70">
              {subtest.sequence.length} tentatives
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
          {subtest.sequence.map((slot, index) => (
            <div
              key={`${subtest.key}-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
            >
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Tentative{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    pelzSlotColorClassByLetter
                  )}`}
                >
                  {index + 1}
                </span>{" "}
                -{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    pelzSlotColorClassByLetter
                  )}`}
                >
                  {slot}
                </span>{" "}
                <span className="text-[var(--muted)]">
                  ({getPelzDistanceForSlot(subtest.key, slot)})
                </span>
              </span>
              <p className="text-sm">
                Resultat:{" "}
                <span className="font-medium">
                  {attempts[subtest.key][index]
                    ? getPelzResultLabel(
                        subtest.key,
                        attempts[subtest.key][index] as PelzResultValue
                      )
                    : "-"}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>
    ),
  }));

  return (
    <>
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Apercu du test
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          {PELZ_PUTTING_TEST.title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Vue en lecture seule pour valider la structure du test.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Retour
          </button>
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
            Apercu
          </span>
        </div>
      </section>

      <PelzResponsiveAccordion
        mobileItems={[
          { id: "bilan", label: "Bilan", content: summarySection },
          ...subtestItems,
        ]}
        defaultOpenId={subtestItems[0]?.id ?? null}
        desktopContent={
          <>
            {summarySection}
            {PELZ_PUTTING_TEST.subtests.map((subtest) => (
              <section key={subtest.key} className="panel rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {subtest.label}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Distances:{" "}
                      {renderDistanceLabel(
                        subtest.key,
                        pelzDistanceItemsByKey,
                        pelzDistanceLabelByKey,
                        pelzSlotColorClassByLetter
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiagramSubtest(subtest.key)}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                      aria-label={`Ouvrir schema ${subtest.label}`}
                    >
                      Schema
                    </button>
                    <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] opacity-70">
                      {subtest.sequence.length} tentatives
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
                  {subtest.sequence.map((slot, index) => (
                    <div
                      key={`${subtest.key}-${index}`}
                      className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
                    >
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Tentative{" "}
                        <span
                          className={`font-semibold ${getSlotColorClass(
                            slot,
                            pelzSlotColorClassByLetter
                          )}`}
                        >
                          {index + 1}
                        </span>{" "}
                        -{" "}
                        <span
                          className={`font-semibold ${getSlotColorClass(
                            slot,
                            pelzSlotColorClassByLetter
                          )}`}
                        >
                          {slot}
                        </span>{" "}
                        <span className="text-[var(--muted)]">
                          ({getPelzDistanceForSlot(subtest.key, slot)})
                        </span>
                      </span>
                      <p className="text-sm">
                        Resultat:{" "}
                        <span className="font-medium">
                          {attempts[subtest.key][index]
                            ? getPelzResultLabel(
                                subtest.key,
                                attempts[subtest.key][index] as PelzResultValue
                              )
                            : "-"}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        }
      />

      <section className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </button>
      </section>

      <PelzDiagramModal
        open={diagramSubtest !== null}
        onClose={() => setDiagramSubtest(null)}
        title={diagramMeta?.title ?? "Schema"}
        alt={diagramMeta?.alt ?? "Schema du sous-test"}
        diagramKey={diagramMeta?.diagramKey ?? null}
      />
    </>
  );
}

function PelzApprochesPreview({ onBack }: PreviewProps) {
  const [diagramSubtest, setDiagramSubtest] = useState<PelzApprochesSubtestKey | null>(
    null
  );
  const attempts = useMemo(() => createEmptyPelzApprochesAttempts(), []);
  const subtestScores = useMemo(
    () =>
      PELZ_APPROCHES_TEST.subtests.map((subtest) => ({
        key: subtest.key,
        ...computePelzApprochesSubtestScore(subtest.key, attempts[subtest.key]),
      })),
    [attempts]
  );
  const totalPoints = subtestScores.reduce((acc, score) => acc + score.totalPoints, 0);
  const isComplete = subtestScores.every((score) => score.indexValue !== null);
  const totalIndex = isComplete ? computePelzApprochesTotalIndex(totalPoints) : null;
  const diagramMeta = useMemo(() => {
    if (!diagramSubtest) return null;
    const subtest = PELZ_APPROCHES_TEST.subtests.find(
      (item) => item.key === diagramSubtest
    );
    return {
      title: subtest?.label ?? "Schema",
      alt: PELZ_APPROCHES_DIAGRAM_ALT_TEXT[diagramSubtest],
      diagramKey: PELZ_APPROCHES_DIAGRAM_BY_SUBTEST[diagramSubtest],
    };
  }, [diagramSubtest]);

  const summarySection = (
    <section className="panel-soft rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">Resume</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Apercu lecture seule du test.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Total points
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{totalPoints}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Index final: {totalIndex ?? "-"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {subtestScores.map((score) => (
          <div
            key={score.key}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {PELZ_APPROCHES_TEST.subtests.find((s) => s.key === score.key)?.label}
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {score.totalPoints} pts
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Index: {score.indexValue ?? "-"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );

  const subtestItems = PELZ_APPROCHES_TEST.subtests.map((subtest) => ({
    id: subtest.key,
    label: subtest.label,
    content: (
      <section className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">{subtest.label}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Distances:{" "}
              {renderDistanceLabel(
                subtest.key,
                pelzApprochesDistanceItemsByKey,
                pelzApprochesDistanceLabelByKey,
                pelzApprochesSlotColorClassByLetter
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDiagramSubtest(subtest.key)}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              aria-label={`Ouvrir schema ${subtest.label}`}
            >
              Schema
            </button>
            <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] opacity-70">
              {subtest.sequence.length} tentatives
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
          {subtest.sequence.map((slot, index) => (
            <div
              key={`${subtest.key}-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
            >
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Tentative{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    pelzApprochesSlotColorClassByLetter
                  )}`}
                >
                  {index + 1}
                </span>{" "}
                -{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    pelzApprochesSlotColorClassByLetter
                  )}`}
                >
                  {slot}
                </span>{" "}
                <span className="text-[var(--muted)]">
                  ({getPelzApprochesDistanceForSlot(subtest.key, slot)})
                </span>
              </span>
              <p className="text-sm">
                Resultat:{" "}
                <span className="font-medium">
                  {attempts[subtest.key][index]
                    ? getPelzApprochesResultLabel(
                        subtest.key,
                        attempts[subtest.key][index] as PelzApprochesResultValue
                      )
                    : "-"}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>
    ),
  }));

  return (
    <>
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Apercu du test
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          {PELZ_APPROCHES_TEST.title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Vue en lecture seule pour valider la structure du test.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Retour
          </button>
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
            Apercu
          </span>
        </div>
      </section>

      <PelzResponsiveAccordion
        mobileItems={[
          { id: "bilan", label: "Bilan", content: summarySection },
          ...subtestItems,
        ]}
        defaultOpenId={subtestItems[0]?.id ?? null}
        desktopContent={
          <>
            {summarySection}
            {PELZ_APPROCHES_TEST.subtests.map((subtest) => (
              <section key={subtest.key} className="panel rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {subtest.label}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Distances:{" "}
                      {renderDistanceLabel(
                        subtest.key,
                        pelzApprochesDistanceItemsByKey,
                        pelzApprochesDistanceLabelByKey,
                        pelzApprochesSlotColorClassByLetter
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiagramSubtest(subtest.key)}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                      aria-label={`Ouvrir schema ${subtest.label}`}
                    >
                      Schema
                    </button>
                    <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] opacity-70">
                      {subtest.sequence.length} tentatives
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
                  {subtest.sequence.map((slot, index) => (
                    <div
                      key={`${subtest.key}-${index}`}
                      className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
                    >
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Tentative{" "}
                        <span
                          className={`font-semibold ${getSlotColorClass(
                            slot,
                            pelzApprochesSlotColorClassByLetter
                          )}`}
                        >
                          {index + 1}
                        </span>{" "}
                        -{" "}
                        <span
                          className={`font-semibold ${getSlotColorClass(
                            slot,
                            pelzApprochesSlotColorClassByLetter
                          )}`}
                        >
                          {slot}
                        </span>{" "}
                        <span className="text-[var(--muted)]">
                          ({getPelzApprochesDistanceForSlot(subtest.key, slot)})
                        </span>
                      </span>
                      <p className="text-sm">
                        Resultat:{" "}
                        <span className="font-medium">
                          {attempts[subtest.key][index]
                            ? getPelzApprochesResultLabel(
                                subtest.key,
                                attempts[subtest.key][index] as PelzApprochesResultValue
                              )
                            : "-"}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        }
      />

      <section className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </button>
      </section>

      <PelzDiagramModal
        open={diagramSubtest !== null}
        onClose={() => setDiagramSubtest(null)}
        title={diagramMeta?.title ?? "Schema"}
        alt={diagramMeta?.alt ?? "Schema du sous-test"}
        diagramKey={diagramMeta?.diagramKey ?? null}
        bucket={PELZ_APPROCHES_DIAGRAM_BUCKET}
        extension={PELZ_APPROCHES_DIAGRAM_EXTENSION}
      />
    </>
  );
}

function WedgingDrapeauLongPreview({ onBack }: PreviewProps) {
  const [diagramOpen, setDiagramOpen] = useState(false);
  const attempts = useMemo(
    () => Array(WEDGING_DRAPEAU_LONG_TEST.attemptsPerSubtest).fill(null),
    []
  ) as Array<WedgingDrapeauLongResultValue | null>;
  const totalScore = useMemo(
    () => computeWedgingDrapeauLongTotalScore(attempts),
    [attempts]
  );
  const objectivation = useMemo(
    () => computeWedgingDrapeauLongObjectivation("", totalScore),
    [totalScore]
  );

  return (
    <>
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Apercu du test
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text)]">
              {WEDGING_DRAPEAU_LONG_TEST.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Vue en lecture seule pour valider la structure du test.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={() => setDiagramOpen(true)}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              aria-label="Ouvrir schema Wedging drapeau long"
            >
              Schema
            </button>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
              Apercu
            </span>
          </div>
        </div>
      </section>

      <section className="panel-soft rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Total</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Somme des 18 tentatives.</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Total score
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{totalScore}</p>
          </div>
        </div>
        {objectivation ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Objectivation
            </p>
            <p className="mt-2">
              Moyenne attendue (index/drapeau):{" "}
              <span className="font-semibold">
                {formatScore(objectivation.expectedAvgScore)}
              </span>
            </p>
            <p className="mt-1">
              Ecart:{" "}
              <span className="font-semibold">
                {objectivation.delta > 0 ? "+" : ""}
                {formatScore(objectivation.delta)}
              </span>
            </p>
            <p className="mt-1">
              Verdict:{" "}
              <span className="font-semibold capitalize">{objectivation.verdict}</span>
            </p>
          </div>
        ) : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">
              Saisie des 18 balles
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Situations: {renderWedgingDistanceLabel()}.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {WEDGING_DRAPEAU_LONG_SEQUENCE.map((slot, index) => (
            <div
              key={`attempt-${slot}-${index}`}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Tentative{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    wedgingSlotColorClassByLetter
                  )}`}
                >
                  {index + 1}
                </span>{" "}
                -{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    wedgingSlotColorClassByLetter
                  )}`}
                >
                  {slot}
                </span>{" "}
                <span className="text-[var(--muted)]">
                  ({wedgingDistanceBySlot[slot] ?? "-"})
                </span>
              </span>
              <p className="mt-2 text-sm font-medium text-[var(--text)]">
                {attempts[index]
                  ? getWedgingDrapeauLongResultLabel(
                      attempts[index] as WedgingDrapeauLongResultValue
                    )
                  : "-"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </button>
      </section>

      <PelzDiagramModal
        open={diagramOpen}
        onClose={() => setDiagramOpen(false)}
        title="Schema - Wedging drapeau long"
        alt={WEDGING_DRAPEAU_LONG_DIAGRAM_ALT_TEXT}
        diagramKey={diagramOpen ? WEDGING_DRAPEAU_LONG_DIAGRAM_KEY : null}
        bucket={WEDGING_DRAPEAU_LONG_DIAGRAM_BUCKET}
        extension={WEDGING_DRAPEAU_LONG_DIAGRAM_EXTENSION}
      />
    </>
  );
}

function WedgingDrapeauCourtPreview({ onBack }: PreviewProps) {
  const [diagramOpen, setDiagramOpen] = useState(false);
  const attempts = useMemo(
    () => Array(WEDGING_DRAPEAU_COURT_TEST.attemptsPerSubtest).fill(null),
    []
  ) as Array<WedgingDrapeauCourtResultValue | null>;
  const totalScore = useMemo(
    () => computeWedgingDrapeauCourtTotalScore(attempts),
    [attempts]
  );
  const objectivation = useMemo(
    () => computeWedgingDrapeauCourtObjectivation("", totalScore),
    [totalScore]
  );

  return (
    <>
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Apercu du test
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text)]">
              {WEDGING_DRAPEAU_COURT_TEST.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Vue en lecture seule pour valider la structure du test.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={() => setDiagramOpen(true)}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              aria-label="Ouvrir schema Wedging drapeau court"
            >
              Schema
            </button>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
              Apercu
            </span>
          </div>
        </div>
      </section>

      <section className="panel-soft rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Total</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Somme des 18 tentatives.</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Total score
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{totalScore}</p>
          </div>
        </div>
        {objectivation ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Objectivation
            </p>
            <p className="mt-2">
              Moyenne attendue (index/drapeau):{" "}
              <span className="font-semibold">
                {formatScore(objectivation.expectedAvgScore)}
              </span>
            </p>
            <p className="mt-1">
              Ecart:{" "}
              <span className="font-semibold">
                {objectivation.delta > 0 ? "+" : ""}
                {formatScore(objectivation.delta)}
              </span>
            </p>
            <p className="mt-1">
              Verdict:{" "}
              <span className="font-semibold capitalize">{objectivation.verdict}</span>
            </p>
          </div>
        ) : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">
              Saisie des 18 balles
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Situations: {renderWedgingDistanceLabel()}.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {WEDGING_DRAPEAU_COURT_SEQUENCE.map((slot, index) => (
            <div
              key={`attempt-${slot}-${index}`}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Tentative{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    wedgingSlotColorClassByLetter
                  )}`}
                >
                  {index + 1}
                </span>{" "}
                -{" "}
                <span
                  className={`font-semibold ${getSlotColorClass(
                    slot,
                    wedgingSlotColorClassByLetter
                  )}`}
                >
                  {slot}
                </span>{" "}
                <span className="text-[var(--muted)]">
                  ({wedgingDistanceBySlot[slot] ?? "-"})
                </span>
              </span>
              <p className="mt-2 text-sm font-medium text-[var(--text)]">
                {attempts[index]
                  ? getWedgingDrapeauCourtResultLabel(
                      attempts[index] as WedgingDrapeauCourtResultValue
                    )
                  : "-"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </button>
      </section>

      <PelzDiagramModal
        open={diagramOpen}
        onClose={() => setDiagramOpen(false)}
        title="Schema - Wedging drapeau court"
        alt={WEDGING_DRAPEAU_COURT_DIAGRAM_ALT_TEXT}
        diagramKey={diagramOpen ? WEDGING_DRAPEAU_COURT_DIAGRAM_KEY : null}
        bucket={WEDGING_DRAPEAU_COURT_DIAGRAM_BUCKET}
        extension={WEDGING_DRAPEAU_COURT_DIAGRAM_EXTENSION}
      />
    </>
  );
}

export default function CoachTestsPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const slugParam = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const handleBack = () => router.push("/app/coach/tests");

  let content: ReactNode = null;

  if (slugParam === PELZ_PUTTING_SLUG) {
    content = <PelzPuttingPreview onBack={handleBack} />;
  } else if (slugParam === PELZ_APPROCHES_SLUG) {
    content = <PelzApprochesPreview onBack={handleBack} />;
  } else if (slugParam === WEDGING_DRAPEAU_LONG_SLUG) {
    content = <WedgingDrapeauLongPreview onBack={handleBack} />;
  } else if (slugParam === WEDGING_DRAPEAU_COURT_SLUG) {
    content = <WedgingDrapeauCourtPreview onBack={handleBack} />;
  } else {
    content = (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-red-400">Test introuvable.</p>
        <button
          type="button"
          onClick={handleBack}
          className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Retour
        </button>
      </section>
    );
  }

  return <RoleGuard allowedRoles={["owner", "coach", "staff"]}>{content}</RoleGuard>;
}
