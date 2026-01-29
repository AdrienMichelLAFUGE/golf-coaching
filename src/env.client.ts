import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_ADMIN_EMAILS: z.string().optional(),
});

const formatIssues = (issues: z.ZodIssue[]) =>
  issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const parsed = clientSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_ADMIN_EMAILS: process.env.NEXT_PUBLIC_ADMIN_EMAILS,
});

const buildTestEnv = () => ({
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_ADMIN_EMAILS: process.env.NEXT_PUBLIC_ADMIN_EMAILS,
});

export const envClient = (() => {
  if (parsed.success) {
    return parsed.data;
  }
  if (process.env.NODE_ENV === "test") {
    return clientSchema.parse(buildTestEnv());
  }
  throw new Error(`Invalid public env vars: ${formatIssues(parsed.error.issues)}`);
})();
