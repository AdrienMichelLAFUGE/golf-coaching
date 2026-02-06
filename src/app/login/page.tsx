import LoginClient from "./LoginClient";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const reset = searchParams?.reset;
  const resetSuccess = reset === "success";

  return <LoginClient resetSuccess={resetSuccess} />;
}

