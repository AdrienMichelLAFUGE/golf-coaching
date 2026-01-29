import { envClient } from "@/env.client";

const RAW_ADMIN_EMAILS = envClient.NEXT_PUBLIC_ADMIN_EMAILS ?? "adrien.lafuge@outlook.fr";

export const ADMIN_EMAILS = RAW_ADMIN_EMAILS.split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const isAdminEmail = (email?: string | null) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
};
