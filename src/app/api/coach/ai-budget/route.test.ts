import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = () =>
  ({
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

const toMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

describe("GET /api/coach/ai-budget", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when caller is unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: new Error("unauthorized"),
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    const response = await GET(buildRequest());
    expect(response.status).toBe(401);
  });

  it("uses 30-day sliding quota for monthly pro subscriptions", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const now = new Date();
    const currentMonthKey = toMonthKey(now);
    const periodEndIso = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const currentDateIso = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const currentTopupDateIso = new Date(
      now.getTime() - 10 * 24 * 60 * 60 * 1000
    ).toISOString();
    const previousDateIso = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const previousTopupDateIso = new Date(
      now.getTime() - 40 * 24 * 60 * 60 * 1000
    ).toISOString();

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "coach-1",
                    role: "coach",
                    ai_budget_enabled: true,
                    ai_budget_monthly_cents: 2500,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ai_credit_topups") {
          return {
            select: () => ({
              eq: () => ({
                lt: async () => ({
                  data: [
                    { amount_cents: 400, created_at: previousTopupDateIso },
                    { amount_cents: 350, created_at: currentTopupDateIso },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "org-personal",
                      workspace_type: "personal",
                      owner_profile_id: "coach-1",
                      stripe_status: "active",
                      stripe_current_period_end: periodEndIso,
                      stripe_price_id: "price_month_test",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "ai_usage") {
          return {
            select: () => ({
              eq: () => ({
                lt: async () => ({
                  data: [
                    { created_at: previousDateIso, cost_eur_cents: 2800 },
                    { created_at: currentDateIso, cost_eur_cents: 300 },
                    { created_at: currentDateIso, cost_eur_cents: 200 },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest());
    const body = (await response.json()) as {
      summary: {
        spent_cents_current_month: number;
        topup_cents_current_month: number;
        topup_carryover_cents: number;
        topup_remaining_cents_current_month: number;
        base_remaining_cents_current_month: number;
        available_cents_current_month: number;
        remaining_cents_current_month: number;
        usage_percent_current_month: number;
        month_key: string;
        window_kind: string;
        window_days: number;
        quota_reset_at_iso: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.summary.spent_cents_current_month).toBe(500);
    expect(body.summary.topup_cents_current_month).toBe(350);
    expect(body.summary.topup_carryover_cents).toBe(0);
    expect(body.summary.topup_remaining_cents_current_month).toBe(0);
    expect(body.summary.base_remaining_cents_current_month).toBe(2350);
    expect(body.summary.available_cents_current_month).toBe(2850);
    expect(body.summary.remaining_cents_current_month).toBe(2350);
    expect(body.summary.usage_percent_current_month).toBe(18);
    expect(body.summary.window_kind).toBe("sliding_pro");
    expect(body.summary.window_days).toBe(30);
    expect(body.summary.month_key).toBe(currentMonthKey);
    expect(body.summary.quota_reset_at_iso).toBe(periodEndIso);
  });

  it("uses 365-day sliding quota for yearly pro subscriptions", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-2", email: "coach2@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const periodEndIso = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    const usageDateIso = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "coach-2",
                    role: "coach",
                    ai_budget_enabled: false,
                    ai_budget_monthly_cents: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "org-personal-2",
                      workspace_type: "personal",
                      owner_profile_id: "coach-2",
                      stripe_status: "active",
                      stripe_current_period_end: periodEndIso,
                      stripe_price_id: "price_year_test",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "ai_credit_topups") {
          return {
            select: () => ({
              eq: () => ({
                lt: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ai_usage") {
          return {
            select: () => ({
              eq: () => ({
                lt: async () => ({
                  data: [{ created_at: usageDateIso, cost_eur_cents: 1000 }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest());
    const body = (await response.json()) as {
      summary: {
        monthly_budget_cents: number;
        topup_remaining_cents_current_month: number;
        base_remaining_cents_current_month: number;
        available_cents_current_month: number;
        remaining_cents_current_month: number;
        usage_percent_current_month: number;
        window_kind: string;
        window_days: number;
      };
    };

    expect(response.status).toBe(200);
    expect(body.summary.monthly_budget_cents).toBe(30400);
    expect(body.summary.topup_remaining_cents_current_month).toBe(0);
    expect(body.summary.base_remaining_cents_current_month).toBe(29400);
    expect(body.summary.available_cents_current_month).toBe(30400);
    expect(body.summary.remaining_cents_current_month).toBe(29400);
    expect(body.summary.usage_percent_current_month).toBe(3);
    expect(body.summary.window_kind).toBe("sliding_pro");
    expect(body.summary.window_days).toBe(365);
  });
});
