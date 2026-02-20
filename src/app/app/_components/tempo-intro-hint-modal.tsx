"use client";

type TempoIntroHintModalProps = {
  open: boolean;
  dontShowAgain: boolean;
  onDontShowAgainChange: (next: boolean) => void;
  onClose: () => void;
};

export default function TempoIntroHintModal({
  open,
  dontShowAgain,
  onDontShowAgainChange,
  onClose,
}: TempoIntroHintModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[118] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Guide Tempo"
    >
      <button
        type="button"
        aria-label="Fermer le guide Tempo"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="tempo-intro-shell relative w-full max-w-4xl rounded-3xl bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-strong)]">
        <span className="tempo-intro-glow tempo-intro-glow-a" aria-hidden="true" />
        <span className="tempo-intro-glow tempo-intro-glow-b" aria-hidden="true" />
        <span className="tempo-intro-spark tempo-intro-spark-1" aria-hidden="true" />
        <span className="tempo-intro-spark tempo-intro-spark-2" aria-hidden="true" />
        <span className="tempo-intro-spark tempo-intro-spark-3" aria-hidden="true" />
        <span className="tempo-intro-spark tempo-intro-spark-4" aria-hidden="true" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="tempo-intro-overline text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Bienvenue dans Tempo
            </p>
            <h4 className="mt-1 text-base font-semibold text-[var(--text)]">
              3 modes pour guider la seance et accelerer ton workflow
            </h4>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Choisis le mode selon ton moment de coaching. Tu peux passer de l un a l autre a tout
              moment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--panel-strong)] px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
          >
            Commencer
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article
            className="tempo-intro-card rounded-2xl bg-emerald-500/14 p-3"
            style={{ animationDelay: "120ms" }}
          >
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/28 px-1 text-[0.6rem] font-semibold text-emerald-950">
                1
              </span>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-900">
                Prise de note
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text)]">
              <li>
                Pour prendre des notes durant la seance rapidement, et pouvoir construire un
                rapport directement a partir des notes plus tard.
              </li>
            </ul>
          </article>

          <article
            className="tempo-intro-card rounded-2xl bg-sky-500/14 p-3"
            style={{ animationDelay: "210ms" }}
          >
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500/28 px-1 text-[0.6rem] font-semibold text-sky-950">
                2
              </span>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sky-900">
                Coaching
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text)]">
              <li>
                Tu renseignes le club et un constat, Tempo te propose 3 axes priorises pour la
                seance.
              </li>
              <li>
                Tempo connait toutes les donnees rattachees au compte de l eleve: TPI, rapports,
                tests, fichiers datas, etc.
              </li>
            </ul>
          </article>

          <article
            className="tempo-intro-card rounded-2xl bg-amber-500/14 p-3"
            style={{ animationDelay: "300ms" }}
          >
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/28 px-1 text-[0.6rem] font-semibold text-amber-950">
                3
              </span>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-900">
                Redaction rapport
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text)]">
              <li>
                Le mode d edition principal pour les rapports (textes, images, videos et datas).
              </li>
            </ul>
          </article>
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => onDontShowAgainChange(event.target.checked)}
            className="h-4 w-4 rounded accent-sky-200"
          />
          Ne plus me montrer
        </label>
      </div>
      <style jsx>{`
        .tempo-intro-shell {
          overflow: hidden;
          animation: tempoIntroReveal 520ms cubic-bezier(0.2, 0.88, 0.28, 1.08) both;
        }
        .tempo-intro-overline {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }
        .tempo-intro-overline::before {
          content: "";
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 9999px;
          background: linear-gradient(130deg, rgb(16, 185, 129), rgb(14, 165, 233));
          box-shadow: 0 0 12px rgba(14, 165, 233, 0.55);
          animation: tempoIntroPulse 1.8s ease-in-out infinite;
        }
        .tempo-intro-card {
          opacity: 0;
          transform: translateY(14px) scale(0.98);
          animation: tempoIntroCardIn 520ms cubic-bezier(0.18, 0.84, 0.24, 1.02) both;
        }
        .tempo-intro-glow {
          position: absolute;
          pointer-events: none;
          border-radius: 9999px;
          filter: blur(2px);
        }
        .tempo-intro-glow-a {
          width: 220px;
          height: 220px;
          left: -84px;
          top: -90px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.24), rgba(16, 185, 129, 0));
          animation: tempoIntroFloat 4s ease-in-out infinite;
        }
        .tempo-intro-glow-b {
          width: 240px;
          height: 240px;
          right: -98px;
          bottom: -110px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.22), rgba(14, 165, 233, 0));
          animation: tempoIntroFloat 4.8s ease-in-out infinite;
          animation-delay: 0.3s;
        }
        .tempo-intro-spark {
          position: absolute;
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          pointer-events: none;
          box-shadow: 0 0 10px rgba(14, 165, 233, 0.45);
          animation: tempoIntroSpark 1.6s ease-in-out infinite;
        }
        .tempo-intro-spark-1 {
          left: 20%;
          top: 14%;
          background: rgba(16, 185, 129, 0.75);
          animation-delay: 0.1s;
        }
        .tempo-intro-spark-2 {
          right: 22%;
          top: 16%;
          background: rgba(14, 165, 233, 0.72);
          animation-delay: 0.35s;
        }
        .tempo-intro-spark-3 {
          left: 26%;
          bottom: 18%;
          background: rgba(14, 165, 233, 0.65);
          animation-delay: 0.2s;
        }
        .tempo-intro-spark-4 {
          right: 26%;
          bottom: 16%;
          background: rgba(16, 185, 129, 0.72);
          animation-delay: 0.48s;
        }
        @keyframes tempoIntroReveal {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tempoIntroCardIn {
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tempoIntroPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.92;
          }
          50% {
            transform: scale(1.22);
            opacity: 1;
          }
        }
        @keyframes tempoIntroFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @keyframes tempoIntroSpark {
          0%,
          100% {
            opacity: 0.2;
            transform: scale(0.9);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.15);
          }
        }
      `}</style>
    </div>
  );
}
