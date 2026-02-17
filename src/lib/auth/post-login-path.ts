import { isAdminEmail } from "@/lib/admin";

export type AppProfileRole = "owner" | "coach" | "staff" | "student" | "parent";

export const resolvePostLoginPath = ({
  role,
  email,
}: {
  role?: string | null;
  email?: string | null;
}) => {
  if (isAdminEmail(email)) return "/app/admin";
  if (role === "parent") return "/parent";
  if (role === "student") return "/app/eleve";
  return "/app/coach";
};
