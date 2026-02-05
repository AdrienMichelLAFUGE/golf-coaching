import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/stripe", () => {
  const stripeMocks = {
    billingPortal: { sessions: { create: jest.fn() } },
  };
  return { stripe: stripeMocks };
});

const stripeMocks = (
  jest.requireMock("@/lib/stripe") as {
    stripe: {
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

const buildRequest = () => ({}) as Request;

describe("POST /api/billing/portal", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    stripeMocks.billingPortal.sessions.create.mockReset();
  });

  it("requires stripe customer id", async () => {
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
                      plan_tier: "pro",
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

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());
    expect(response.status).toBe(400);
  });

  it("returns portal session url", async () => {
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

    const response = await POST(buildRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.url).toBe("https://portal.stripe.test/session");
  });
});
