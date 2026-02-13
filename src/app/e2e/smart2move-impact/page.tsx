import Smart2MoveFxPanel from "@/app/app/_components/smart2move-fx-panel";
import {
  buildSmart2MoveAiContext,
  type Smart2MoveFxAnnotation,
} from "@/lib/radar/smart2move-annotations";

const IMPACT_X = 0.72;

const buildFixtureImageUrl = () => {
  const width = 1200;
  const height = 680;
  const impactLineX = Math.round(width * IMPACT_X);
  const plotTop = 64;
  const plotBottom = height - 40;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#f7fafc" />
  <rect x="90" y="52" width="${width - 170}" height="${height - 104}" fill="#ffffff" stroke="#d1d5db" stroke-width="2" />
  <line x1="90" y1="${Math.round(height * 0.35)}" x2="${width - 80}" y2="${Math.round(height * 0.35)}" stroke="#cbd5e1" stroke-width="2" />
  <line x1="90" y1="${Math.round(height * 0.58)}" x2="${width - 80}" y2="${Math.round(height * 0.58)}" stroke="#cbd5e1" stroke-width="2" />
  <rect x="${impactLineX - 4}" y="${plotTop}" width="8" height="${plotBottom - plotTop}" fill="#000000" />
  <polyline points="96,474 224,446 332,402 436,334 540,248 630,190 712,164 804,208 904,318 1012,448 1126,522" fill="none" stroke="#0ea5e9" stroke-width="5" />
  <polyline points="96,404 224,372 332,336 436,292 540,260 630,230 712,224 804,248 904,312 1012,378 1126,432" fill="none" stroke="#f97316" stroke-width="4" />
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const FIXTURE_ANNOTATIONS: Smart2MoveFxAnnotation[] = [
  {
    bubbleKey: "address_backswing",
    id: "a-1",
    title: "Adresse -> Backswing",
    detail: "Repartition initiale stable.",
    reasoning: null,
    solution: null,
    anchor: { x: 0.2, y: 0.28 },
    evidence: null,
  },
  {
    bubbleKey: "transition_impact",
    id: "a-2",
    title: "Transition -> Impact",
    detail: "La zone doit finir exactement sur la ligne noire d impact.",
    reasoning: null,
    solution: null,
    anchor: { x: 0.46, y: 0.4 },
    evidence: null,
  },
  {
    bubbleKey: "peak_intensity_timing",
    id: "a-3",
    title: "Intensite des pics et chronologie",
    detail: "Le pic principal est post-impact.",
    reasoning: null,
    solution: null,
    anchor: { x: 0.78, y: 0.38 },
    evidence: null,
  },
  {
    bubbleKey: "summary",
    id: "a-4",
    title: "Resume global",
    detail: "Bonne coordination temporelle globale.",
    reasoning: null,
    solution: null,
    anchor: { x: 0.9, y: 0.7 },
    evidence: null,
  },
];

export default function Smart2MoveImpactFixturePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-[var(--text)]">Fixture Playwright Smart2Move</h1>
        <p className="text-sm text-[var(--muted)]">
          Verifie que la fin de la zone Transition {"->"} Impact est alignee sur la ligne noire d
          impact detectee.
        </p>
      </header>
      <Smart2MoveFxPanel
        analysis="Fixture visuelle pour test Playwright."
        fileName="smart2move-impact-fixture.png"
        imageUrl={buildFixtureImageUrl()}
        aiContext={buildSmart2MoveAiContext(FIXTURE_ANNOTATIONS, "fixture", IMPACT_X)}
        annotations={FIXTURE_ANNOTATIONS}
      />
    </main>
  );
}
