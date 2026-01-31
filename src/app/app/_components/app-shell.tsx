"use client";

import { useState } from "react";
import AppHeader from "./app-header";
import AppNav from "./app-nav";
import ShareInvitesGate from "./share-invites-gate";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen px-4 pb-6 pt-0 text-[var(--text)]">
      <div className="mx-auto w-full max-w-[1400px] space-y-6 2xl:max-w-[1600px]">
        <AppHeader
          onToggleNav={() => setMobileNavOpen((prev) => !prev)}
          isNavOpen={mobileNavOpen}
        />
        <ShareInvitesGate />
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div>
            <div className="hidden md:block md:sticky md:top-[6.5rem] md:self-start">
              <AppNav />
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
          <main className="min-w-0 space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
