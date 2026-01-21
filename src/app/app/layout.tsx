import AuthGate from "./_components/auth-gate";
import AppHeader from "./_components/app-header";
import AppNav from "./_components/app-nav";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGate>
      <div className="min-h-screen overflow-x-hidden px-4 py-6 text-[var(--text)]">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <AppHeader />
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <AppNav />
            <main className="min-w-0 space-y-6">{children}</main>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
