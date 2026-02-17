import type { LayoutPreset, LayoutPresetId } from "./fixtures";

type LayoutSelectorMockProps = {
  presets: LayoutPreset[];
  selectedId: LayoutPresetId | null;
  onSelect: (id: LayoutPresetId) => void;
  forcedId?: LayoutPresetId | null;
};

const sourceTone: Record<LayoutPresetId, string> = {
  quick: "border-sky-300/50 bg-sky-400/10 text-sky-100",
  standard: "border-emerald-300/50 bg-emerald-400/10 text-emerald-100",
  detail: "border-amber-300/50 bg-amber-400/10 text-amber-100",
};

export default function LayoutSelectorMock({
  presets,
  selectedId,
  onSelect,
  forcedId = null,
}: LayoutSelectorMockProps) {
  const effectiveSelectedId = forcedId ?? selectedId;
  const selectedPreset =
    presets.find((preset) => preset.id === effectiveSelectedId) ?? presets[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-3">
        {presets.map((preset) => {
          const selected = effectiveSelectedId === preset.id;
          const locked = forcedId !== null && preset.id !== forcedId;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={locked}
              onClick={() => {
                if (!locked) onSelect(preset.id);
              }}
              className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                selected
                  ? "border-white/35 bg-white/15 shadow-[0_12px_30px_rgba(14,165,233,0.18)]"
                  : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
              } ${locked ? "cursor-not-allowed opacity-65" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-[var(--text)]">{preset.title}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.16em] ${sourceTone[preset.id]}`}
                >
                  {preset.sections.length} sections
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{preset.hint}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{preset.info}</p>
              {locked ? (
                <p className="mt-2 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                  verrouillé sur ce flow démo
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {preset.sections.slice(0, 5).map((section) => (
                  <span
                    key={`${preset.id}-${section}`}
                    className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--text)]"
                  >
                    {section}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <aside className="rounded-2xl border border-white/12 bg-white/8 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Aperçu layout</p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{selectedPreset.title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{selectedPreset.hint}</p>
        {forcedId ? (
          <p className="mt-2 rounded-full border border-sky-300/45 bg-sky-400/12 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-sky-100">
            preset verrouillé: Rapide (3 sections)
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          {selectedPreset.sections.map((section, index) => (
            <div
              key={`preview-${selectedPreset.id}-${section}`}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-[var(--text)]"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[0.62rem]">
                {index + 1}
              </span>
              <span>{section}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
