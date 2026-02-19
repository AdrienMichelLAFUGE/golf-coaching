import { z } from "zod";

export type LoginSearchParams = Record<string, string | string[] | undefined>;
export type LoginAccountType = "coach" | "student" | "parent";
export type CoachFlow = "signin" | "signup";

const nextSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "Invalid next path.",
  })
  .refine((value) => !value.includes("\\"), { message: "Invalid next path." });

const readFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const parseLoginPageParams = async (
  searchParams?: Promise<LoginSearchParams>
) => {
  const resolved = await searchParams;

  const reset = readFirstParam(resolved?.reset);
  const resetSuccess = reset === "success";

  const next = readFirstParam(resolved?.next);
  const nextPath = next ? nextSchema.safeParse(next).data ?? null : null;

  const mode = readFirstParam(resolved?.mode);
  const parsedMode = mode === "signup" || mode === "signin" ? mode : null;

  const account = readFirstParam(resolved?.account);
  const parsedAccount =
    account === "coach" || account === "student" || account === "parent"
      ? account
      : null;

  return {
    resetSuccess,
    nextPath,
    initialCoachFlow: parsedMode as CoachFlow | null,
    initialAccountType: parsedAccount as LoginAccountType | null,
  };
};

