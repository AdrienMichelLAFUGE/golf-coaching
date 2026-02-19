import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: jest.fn() } },
  },
}));

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

const stripeMocks = (
  jest.requireMock("@/lib/stripe") as {
    stripe: { checkout: { sessions: { create: jest.Mock } } };
  }
).stripe;

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("POST /api/coach/ai-budget/topup-checkout", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    stripeMocks.checkout.sessions.create.mockReset();
  });

  it("returns 409 when ai budget is disabled", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

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
                    org_id: "org-1",
                    ai_budget_enabled: false,
                  },
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

    const response = await POST(
      buildRequest({
        amount_cents: 1000,
      })
    );

    expect(response.status).toBe(409);
  });

  it("creates Stripe checkout session for coach topup", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

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
                    org_id: "org-1",
                    ai_budget_enabled: true,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    stripeMocks.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.test/topup-coach",
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        amount_cents: 1000,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.test/topup-coach");
    expect(stripeMocks.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: [{ price: "price_ai_credit_10_test", quantity: 1 }],
        metadata: expect.objectContaining({
          flow: "ai_credit_topup",
          org_id: "org-1",
          coach_id: "coach-1",
          actor_user_id: "coach-1",
          topup_cents: "1000",
          topup_actions: "350",
        }),
      })
    );
  });
});
