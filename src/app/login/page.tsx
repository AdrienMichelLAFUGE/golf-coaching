import LoginClient from "./LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  // Next.js (App Router) may pass searchParams as a Promise in newer versions.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const resetRaw = resolved?.reset;
  const reset = Array.isArray(resetRaw) ? resetRaw[0] : resetRaw;
  const resetSuccess = reset === "success";

  return <LoginClient resetSuccess={resetSuccess} />;
}
