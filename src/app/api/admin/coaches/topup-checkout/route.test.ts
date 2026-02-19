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

describe("POST /api/admin/coaches/topup-checkout", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    stripeMocks.checkout.sessions.create.mockReset();
  });

  it("returns 403 when caller is not admin", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(
      buildRequest({
        orgId: "org-1",
        coachId: "coach-1",
        amount_cents: 1000,
      })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(403);
  });

  it("returns 422 when topup amount is not supported", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: jest.fn(),
    });

    const response = await POST(
      buildRequest({
        orgId: "org-1",
        coachId: "coach-1",
        amount_cents: 700,
      })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Montant de recharge non supporte.");
  });

  it("creates Stripe checkout session for a fixed topup", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "org-1",
                    workspace_type: "org",
                    owner_profile_id: "coach-1",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "coach-1", role: "coach" },
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
      url: "https://checkout.stripe.test/topup",
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        orgId: "org-1",
        coachId: "coach-1",
        amount_cents: 1000,
      })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://checkout.stripe.test/topup");
    expect(stripeMocks.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: [{ price: "price_ai_credit_10_test", quantity: 1 }],
        metadata: expect.objectContaining({
          flow: "ai_credit_topup",
          org_id: "org-1",
          coach_id: "coach-1",
          actor_user_id: "admin-1",
          topup_cents: "1000",
        }),
      })
    );
  });
});
