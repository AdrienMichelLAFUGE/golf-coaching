const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M5.5 12.5l4 4 9-9" />
  </svg>
);

export default function CentralizationSection() {
  return (
    <section
      className="reveal panel-soft rounded-3xl p-8 md:p-10 lg:ml-auto lg:max-w-[90%]"
      data-reveal-stagger
    >
      <div className="mx-auto max-w-3xl">
        <div data-reveal-item>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Centralisation
          </p>
          <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
            Un suivi élève plus pro, au même endroit.
          </h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Remplacez le bricolage (notes, exports, fichiers, rapports) par une fiche
            élève unique : claire, rangée, et exploitable après chaque séance.
          </p>

          <div className="mt-5 space-y-2 text-sm text-[var(--muted)]">
            <p>
              <span className="mr-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Avant
              </span>
              Vous jonglez entre outils, documents et exports. Le suivi est là, mais il
              n&apos;est pas structuré.
            </p>
            <p>
              <span className="mr-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Après
              </span>
              Chaque élève a une fiche propre : séances, données, notes et rapport reliés
              au bon endroit.
            </p>
          </div>
        </div>

        <ul className="mt-6 space-y-3 text-sm text-[var(--muted)]">
          {[
            "Un cadre constant : même structure à chaque séance, suivi lisible.",
            "Moins d'oubli : données et notes rattachées au bon élève.",
            "Une image plus pro : rapport clair, cohérent, facile à partager.",
          ].map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              data-reveal-item
            >
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                <CheckIcon />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs text-[var(--muted)]" data-reveal-item>
          Compatible avec Trackman, Flightscope, TPI, Smart2Move, et plus encore.
        </p>
      </div>
    </section>
  );
}
