import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { retrieve: jest.fn() } },
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
    stripe: { checkout: { sessions: { retrieve: jest.Mock } } };
  }
).stripe;

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("POST /api/coach/ai-budget/topup-confirm", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    stripeMocks.checkout.sessions.retrieve.mockReset();
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
    const response = await POST(buildRequest({ session_id: "cs_1" }));
    expect(response.status).toBe(401);
  });

  it("credits topup from paid checkout session", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const topupInsert = jest.fn(async () => ({ error: null }));

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
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: topupInsert,
          };
        }
        return {};
      }),
    };

    stripeMocks.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_topup_1",
      payment_status: "paid",
      metadata: {
        flow: "ai_credit_topup",
        coach_id: "coach-1",
        org_id: "org-1",
        topup_cents: "500",
      },
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ session_id: "cs_topup_1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("credited");
    expect(body.amount_cents).toBe(500);
    expect(body.amount_actions).toBe(150);
    expect(topupInsert).toHaveBeenCalledTimes(1);
    const firstInsertCall = (topupInsert as jest.Mock).mock.calls[0] as [
      Array<{
        profile_id: string;
        amount_cents: number;
        created_by: string;
      }>,
    ];
    const insertedTopup = firstInsertCall?.[0]?.[0];
    expect(insertedTopup).toEqual(
      expect.objectContaining({
        profile_id: "coach-1",
        amount_cents: 150,
        created_by: "coach-1",
      })
    );
  });
});
