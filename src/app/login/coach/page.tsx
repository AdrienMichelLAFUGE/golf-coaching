import LoginClient from "../LoginClient";
import { parseLoginPageParams } from "../login-search-params";

export default async function CoachLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = await parseLoginPageParams(searchParams);

  return (
    <LoginClient
      resetSuccess={parsed.resetSuccess}
      nextPath={parsed.nextPath}
      initialCoachFlow={parsed.initialCoachFlow}
      initialAccountType="coach"
      forcedAccountType="coach"
    />
  );
}

