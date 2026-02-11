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
      {/* Covers the 1rem "top gap" (sticky top-4) so scrolled content never shows above the header/nav. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[var(--app-sticky-top)] bg-[var(--app-canvas)]" />
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1600px]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <aside className="app-sidebar hidden md:sticky md:top-[var(--app-sticky-top)] md:block md:h-[calc(100dvh-(2*var(--app-sticky-top)))] md:shrink-0 md:self-start">
            <AppNav />
          </aside>

          <div className="min-w-0 flex-1 space-y-4">
            <AppHeader
              onToggleNav={() => setMobileNavOpen((prev) => !prev)}
              isNavOpen={mobileNavOpen}
            />
            <ShareInvitesGate />
            <main className="app-main min-w-0 space-y-4 rounded-3xl bg-[var(--app-surface)] p-4 md:p-6">
              {children}
            </main>
          </div>

          {mobileNavOpen ? (
            <div className="fixed inset-0 z-40 flex justify-end bg-black/60 p-4 md:hidden">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="absolute inset-0"
                aria-label="Fermer la navigation"
              />
              <div className="relative w-[min(320px,90vw)]">
                <AppNav
                  onNavigate={() => setMobileNavOpen(false)}
                  onCollapse={() => setMobileNavOpen(false)}
                  forceExpanded
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
