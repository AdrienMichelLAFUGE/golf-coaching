import { POST } from "./route";

jest.mock("server-only", () => ({}));

const generateReportKpisForPublishedReport = jest.fn();
jest.mock("@/lib/ai/report-kpis", () => ({
  generateReportKpisForPublishedReport: (...args: unknown[]) =>
    generateReportKpisForPublishedReport(...args),
}));

jest.mock("@/lib/plan-access", () => ({
  loadPersonalPlanTier: async () => "pro",
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
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
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: { get: () => null },
  }) as unknown as Request;

const buildSelectSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      single: async () => result,
    }),
  }),
});

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => result,
      single: async () => result,
    };
    return chain;
  },
});

describe("POST /api/admin/report-kpis/backfill", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    generateReportKpisForPublishedReport.mockReset();
    generateReportKpisForPublishedReport.mockResolvedValue({ status: "ready" });
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => buildSelectSingle({ data: null, error: null }),
    } as unknown as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const res = await POST(buildRequest({ limit: 3 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin in org workspace", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "admin@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: "org-1" }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as unknown as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return buildSelectSingle({
            data: { id: "org-1", workspace_type: "org", owner_profile_id: null },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "coach", status: "active" },
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const res = await POST(buildRequest({ limit: 3 }));
    expect(res.status).toBe(403);
    expect(generateReportKpisForPublishedReport).not.toHaveBeenCalled();
  });
});

