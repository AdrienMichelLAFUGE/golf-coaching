import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/stripe", () => {
  const stripeMocks = {
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  };
  return { stripe: stripeMocks };
});

const stripeMocks = (
  jest.requireMock("@/lib/stripe") as {
    stripe: {
      checkout: { sessions: { create: jest.Mock } };
      billingPortal: { sessions: { create: jest.Mock } };
    };
  }
).stripe;

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/billing/checkout", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    stripeMocks.checkout.sessions.create.mockReset();
    stripeMocks.billingPortal.sessions.create.mockReset();
  });

  it("creates a checkout session for free plan", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
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
                single: async () => ({
                  data: { id: "user-1", role: "coach" },
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
                      id: "org-1",
                      plan_tier: "free",
                      workspace_type: "personal",
                      owner_profile_id: "user-1",
                      stripe_customer_id: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    stripeMocks.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ interval: "month" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.test/session");
    expect(stripeMocks.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_month_test", quantity: 1 }],
      })
    );
  });

  it("returns portal link when already pro", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-2", email: "coach@example.com" } },
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
                single: async () => ({
                  data: { id: "user-2", role: "coach" },
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
                      id: "org-2",
                      plan_tier: "pro",
                      workspace_type: "personal",
                      owner_profile_id: "user-2",
                      stripe_customer_id: "cus_123",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    stripeMocks.billingPortal.sessions.create.mockResolvedValue({
      url: "https://portal.stripe.test/session",
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ interval: "year" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe("portal");
    expect(body.url).toBe("https://portal.stripe.test/session");
  });

  it("blocks enterprise checkout", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-3", email: "coach@example.com" } },
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
                single: async () => ({
                  data: { id: "user-3", role: "coach" },
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
                      id: "org-3",
                      plan_tier: "enterprise",
                      workspace_type: "personal",
                      owner_profile_id: "user-3",
                      stripe_customer_id: null,
                    },
                    error: null,
                  }),
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

    const response = await POST(buildRequest({ interval: "month" }));
    expect(response.status).toBe(409);
  });
});
