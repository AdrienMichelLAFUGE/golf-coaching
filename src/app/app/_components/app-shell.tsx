"use client";

import { useState } from "react";
import AppHeader from "./app-header";
import AppNav from "./app-nav";
import ShareInvitesGate from "./share-invites-gate";
import LastAppPathTracker from "./last-app-path-tracker";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--app-canvas)] px-3 py-4 text-[var(--text)] md:px-6 md:py-6">
      <LastAppPathTracker />
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1600px]">
        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
          <aside className="hidden md:sticky md:top-6 md:block md:self-start md:h-[calc(100dvh-3rem)] md:overflow-hidden">
            <AppNav />
          </aside>

          <div className="min-w-0 space-y-4">
            <AppHeader
              onToggleNav={() => setMobileNavOpen((prev) => !prev)}
              isNavOpen={mobileNavOpen}
            />
            <ShareInvitesGate />
            <main className="app-main min-w-0 space-y-4 rounded-3xl bg-[var(--app-surface)] p-4 md:p-6">
              {children}
            </main>
          </div>

          <div
            className={`fixed inset-0 z-40 flex justify-end bg-black/60 p-4 transition ${
              mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
            } md:hidden`}
            aria-hidden={!mobileNavOpen}
          >
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0"
              aria-label="Fermer la navigation"
            />
            <div
              className={`relative w-[min(320px,90vw)] transition-transform duration-300 ${
                mobileNavOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <AppNav
                onNavigate={() => setMobileNavOpen(false)}
                onCollapse={() => setMobileNavOpen(false)}
                forceExpanded
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
