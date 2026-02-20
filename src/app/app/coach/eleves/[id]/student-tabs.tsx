"use client";

import Link from "next/link";

type StudentTabsProps = {
  studentId: string;
  activeTab: "profile" | "tempo";
  tempoDisabled?: boolean;
  tempoDisabledReason?: string;
};

export default function StudentTabs({
  studentId,
  activeTab,
  tempoDisabled = false,
  tempoDisabledReason = "",
}: StudentTabsProps) {
  const tabBaseClass =
    "inline-flex items-center rounded-full px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide transition";
  const activeClass = "bg-emerald-100 text-emerald-900";
  const inactiveClass = "bg-white/70 text-slate-700 hover:bg-white";

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/55 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.10)]">
        <Link
          href={`/app/coach/eleves/${studentId}`}
          className={`${tabBaseClass} ${activeTab === "profile" ? activeClass : inactiveClass}`}
        >
          Profil eleve
        </Link>
        {tempoDisabled ? (
          <span
            className={`${tabBaseClass} tempo-tab tempo-tab-disabled cursor-not-allowed`}
            title={tempoDisabledReason || "Tempo indisponible sur cet acces"}
            aria-disabled="true"
          >
            <span className="tempo-tab-label">TEMPO</span>
            <span className="tempo-tab-chip">AI</span>
          </span>
        ) : (
          <Link
            href={`/app/coach/eleves/${studentId}/tempo`}
            className={`${tabBaseClass} tempo-tab ${
              activeTab === "tempo" ? "tempo-tab-active" : "tempo-tab-idle"
            }`}
          >
            <span className="tempo-tab-label">TEMPO</span>
            <span className="tempo-tab-chip">AI</span>
          </Link>
        )}
      </div>
      {tempoDisabled && tempoDisabledReason ? (
        <p className="text-xs font-medium text-slate-600">{tempoDisabledReason}</p>
      ) : null}
      <style jsx global>{`
        .tempo-tab {
          position: relative;
          isolation: isolate;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.36rem;
          letter-spacing: 0.14em;
          font-weight: 700;
          min-width: 6.8rem;
          border: none;
          background: transparent;
          box-shadow: none;
          transition:
            transform 220ms ease,
            box-shadow 220ms ease,
            color 220ms ease;
        }
        .tempo-tab-label {
          line-height: 1;
          font-weight: 800;
        }
        .tempo-tab-chip {
          border-radius: 9999px;
          padding: 0.12rem 0.36rem;
          font-size: 0.5rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          line-height: 1;
          transition:
            background-color 220ms ease,
            color 220ms ease,
            box-shadow 220ms ease;
        }
        .tempo-tab::after {
          content: "";
          position: absolute;
          inset: -10px;
          z-index: -2;
          border-radius: 9999px;
          background: radial-gradient(
            circle,
            rgba(14, 165, 233, 0.25) 0%,
            rgba(16, 185, 129, 0.16) 35%,
            rgba(14, 165, 233, 0) 72%
          );
          filter: blur(12px);
          opacity: 0;
          transform: scale(0.95);
          transition:
            opacity 220ms ease,
            transform 320ms ease;
        }
        .tempo-tab-idle {
          color: rgb(15, 23, 42);
          border: none;
          background: transparent;
          box-shadow: none;
        }
        .tempo-tab-idle::after {
          opacity: 0.42;
          transform: scale(1);
          animation: tempo-tab-glow-breathe 2.2s ease-in-out infinite;
        }
        .tempo-tab-idle .tempo-tab-label {
          color: rgb(2, 132, 199);
          background-image: linear-gradient(
            120deg,
            rgb(5, 150, 105),
            rgb(2, 132, 199),
            rgb(15, 118, 110),
            rgb(5, 150, 105)
          );
          background-size: 260% 260%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          text-shadow:
            0 0 8px rgba(14, 165, 233, 0.34),
            0 0 14px rgba(16, 185, 129, 0.24);
          will-change: background-position;
          animation: tempo-text-shift 1.7s linear infinite;
        }
        .tempo-tab-idle .tempo-tab-chip {
          background: rgba(14, 165, 233, 0.1);
          color: rgb(3, 105, 161);
          box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.22) inset;
        }
        .tempo-tab-idle:hover {
          transform: translateY(-1px);
        }
        .tempo-tab-idle:hover::after {
          opacity: 0.5;
          transform: scale(1.03);
        }
        .tempo-tab-idle:hover .tempo-tab-chip {
          background: rgba(16, 185, 129, 0.16);
          color: rgb(6, 95, 70);
          box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.25) inset;
        }
        .tempo-tab-active {
          color: rgb(6, 95, 70);
          border: 1px solid transparent;
          background-image:
            linear-gradient(130deg, rgba(220, 252, 231, 0.9), rgba(224, 242, 254, 0.88)),
            linear-gradient(
              120deg,
              rgba(16, 185, 129, 0.85),
              rgba(14, 165, 233, 0.82),
              rgba(16, 185, 129, 0.85)
            );
          background-clip: padding-box, border-box;
          background-origin: border-box;
          background-size: 100% 100%, 240% 240%;
          animation: tempo-border-shift 4.8s linear infinite;
          box-shadow: 0 14px 28px rgba(14, 165, 233, 0.24);
          transform: translateY(-1px);
        }
        .tempo-tab-active .tempo-tab-label {
          color: rgb(6, 95, 70);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
        }
        .tempo-tab-active .tempo-tab-chip {
          background: rgba(255, 255, 255, 0.74);
          color: rgb(6, 95, 70);
          box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.22) inset;
        }
        .tempo-tab-active::after {
          opacity: 0.68;
          transform: scale(1.04);
          animation: tempo-tab-glow-breathe 2.4s ease-in-out infinite;
        }
        .tempo-tab-disabled {
          color: rgb(100, 116, 139);
          opacity: 0.9;
          background: transparent;
          border: none;
          animation: none;
          box-shadow: none;
        }
        .tempo-tab-disabled .tempo-tab-chip {
          background: rgba(148, 163, 184, 0.12);
          color: rgb(100, 116, 139);
          box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.18) inset;
        }
        .tempo-tab-disabled::after {
          opacity: 0.08;
        }
        @keyframes tempo-border-shift {
          0%,
          100% {
            background-position:
              0 0,
              0% 50%;
          }
          50% {
            background-position:
              0 0,
              100% 50%;
          }
        }
        @keyframes tempo-text-shift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        @keyframes tempo-tab-glow-breathe {
          0%,
          100% {
            opacity: 0.56;
            transform: scale(1.01);
          }
          50% {
            opacity: 0.86;
            transform: scale(1.06);
          }
        }
      `}</style>
    </div>
  );
}
