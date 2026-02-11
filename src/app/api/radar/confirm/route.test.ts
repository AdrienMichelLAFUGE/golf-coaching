import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/plan-access", () => ({
  loadPersonalPlanTier: jest.fn(),
}));

jest.mock("@/lib/radar/computeAnalytics", () => ({
  computeAnalytics: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
  from: (table: string) => {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => { single: () => Promise<QueryResult> };
    };
    update: (payload: unknown) => {
      eq: (...args: unknown[]) => Promise<QueryResult>;
    };
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as Request;

const buildSelectSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      single: async () => result,
    }),
  }),
});

describe("POST /api/radar/confirm", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  const planMocks = jest.requireMock("@/lib/plan-access") as {
    loadPersonalPlanTier: jest.Mock;
  };

  const radarMocks = jest.requireMock("@/lib/radar/computeAnalytics") as {
    computeAnalytics: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    planMocks.loadPersonalPlanTier.mockReset();
    radarMocks.computeAnalytics.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("treats explicit club selection as authoritative", async () => {
    let lastUpdatePayload: any = null;

    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "radar_files") {
          return {
            ...buildSelectSingle({
              data: {
                id: "radar-1",
                org_id: "org-1",
                status: "review",
                config: null,
                summary: null,
                analytics: { meta: { club: "7 Iron", ball: null, units: {} } },
              },
              error: null,
            }),
            update: (payload: unknown) => ({
              eq: async () => {
                lastUpdatePayload = payload;
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: "org-1" }, error: null });
        }
        return {
          ...buildSelectSingle({ data: null, error: null }),
          update: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        };
      },
    } as SupabaseClient;

    const admin = { from: jest.fn() };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");
    radarMocks.computeAnalytics.mockReturnValue({
      meta: { club: "7 Iron", units: {} },
      globalStats: {},
      summary: "ok",
    });

    const response = await POST(
      buildRequest({
        radarFileId: "radar-1",
        columns: [{ key: "shot_index", group: null, label: "Shot", unit: null }],
        shots: [{ shot_index: 1 }],
        club: "driver",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(lastUpdatePayload?.analytics?.meta?.club).toBe("Driver");
  });
});

