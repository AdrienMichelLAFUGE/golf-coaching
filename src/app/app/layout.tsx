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
        <div className="mx-auto w-full max-w-[1400px] space-y-6 2xl:max-w-[1600px]">
          <AppHeader />
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <AppNav />
            <main className="min-w-0 space-y-6">{children}</main>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
