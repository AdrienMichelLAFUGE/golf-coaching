import LoginClient from "./LoginClient";
import { parseLoginPageParams } from "./login-search-params";

export default async function LoginPage({
  searchParams,
}: {
  // Next.js (App Router) may pass searchParams as a Promise in newer versions.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = await parseLoginPageParams(searchParams);

  return (
    <LoginClient
      resetSuccess={parsed.resetSuccess}
      nextPath={parsed.nextPath}
      initialCoachFlow={parsed.initialCoachFlow}
      initialAccountType={parsed.initialAccountType}
      requireRoleSelection
    />
  );
}
