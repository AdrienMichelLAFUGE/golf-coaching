if (process.env.NODE_ENV !== "test") {
  // server-only throws in Jest; keep the guard in non-test environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}
import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.string().email(),
  BREVO_SENDER_NAME: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRO_PRICE_MONTH_ID: z.string().min(1),
  STRIPE_PRO_PRICE_YEAR_ID: z.string().min(1),
  STRIPE_SUCCESS_URL: z.string().min(1),
  STRIPE_CANCEL_URL: z.string().min(1),
  MESSAGES_PURGE_CRON_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_ADMIN_EMAILS: z.string().optional(),
  BACKOFFICE_ADMIN_CREDENTIALS: z.string().optional(),
  BACKOFFICE_SESSION_SECRET: z.string().optional(),
  BACKOFFICE_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).optional(),
});

const formatIssues = (issues: z.ZodIssue[]) =>
  issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const parsed = serverSchema.safeParse(process.env);

const buildTestEnv = () => ({
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  OPENAI_API_KEY: "test-openai-key",
  BREVO_API_KEY: "test-brevo-key",
  BREVO_SENDER_EMAIL: "test@example.com",
  BREVO_SENDER_NAME: "Test Sender",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  STRIPE_SECRET_KEY: "test-stripe-secret",
  STRIPE_WEBHOOK_SECRET: "test-stripe-webhook",
  STRIPE_PRO_PRICE_MONTH_ID: "price_month_test",
  STRIPE_PRO_PRICE_YEAR_ID: "price_year_test",
  STRIPE_SUCCESS_URL: "http://localhost:3000/app/coach/parametres?billing=success",
  STRIPE_CANCEL_URL: "http://localhost:3000/app/coach/parametres?billing=cancel",
  MESSAGES_PURGE_CRON_SECRET: process.env.MESSAGES_PURGE_CRON_SECRET ?? "test-messages-purge-secret",
  NEXT_PUBLIC_ADMIN_EMAILS: process.env.NEXT_PUBLIC_ADMIN_EMAILS,
  BACKOFFICE_ADMIN_CREDENTIALS: process.env.BACKOFFICE_ADMIN_CREDENTIALS,
  BACKOFFICE_SESSION_SECRET: process.env.BACKOFFICE_SESSION_SECRET,
  BACKOFFICE_SESSION_TTL_HOURS:
    process.env.BACKOFFICE_SESSION_TTL_HOURS ?? undefined,
});

export const env = (() => {
  if (parsed.success) {
    return parsed.data;
  }
  if (process.env.NODE_ENV === "test") {
    // Allow tests to run without real secrets.
    return serverSchema.parse(buildTestEnv());
  }
  throw new Error(`Invalid server env vars: ${formatIssues(parsed.error.issues)}`);
})();
