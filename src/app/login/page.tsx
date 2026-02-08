import LoginClient from "./LoginClient";
import { z } from "zod";

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

  const nextRaw = resolved?.next;
  const next = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const nextSchema = z
    .string()
    .min(1)
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
      message: "Invalid next path.",
    })
    .refine((value) => !value.includes("\\"), { message: "Invalid next path." });

  const nextPath = next ? nextSchema.safeParse(next).data ?? null : null;

  const modeRaw = resolved?.mode;
  const mode = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
  const parsedMode = mode === "signup" || mode === "signin" ? mode : null;

  return (
    <LoginClient
      resetSuccess={resetSuccess}
      nextPath={nextPath}
      initialCoachFlow={parsedMode}
    />
  );
}
