import { isAdminEmail } from "@/lib/admin";

export type AppProfileRole = "owner" | "coach" | "staff" | "student";

export const resolvePostLoginPath = ({
  role,
  email,
}: {
  role?: string | null;
  email?: string | null;
}) => {
  if (isAdminEmail(email)) return "/app/admin";
  if (role === "student") return "/app/eleve";
  return "/app/coach";
};

