import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/plan-access", () => ({
  loadPersonalPlanTier: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

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
    };
    return chain;
  },
});

const buildInsertSingle = (result: QueryResult) => ({
  insert: () => ({
    select: () => ({
      single: async () => result,
    }),
  }),
});

describe("POST /api/orgs/groups", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const planMocks = jest.requireMock("@/lib/plan-access") as {
    loadPersonalPlanTier: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    planMocks.loadPersonalPlanTier.mockReset();
  });

  it("blocks free coach", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("free");

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({ data: { id: "user-1", org_id: "org-1" } });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({ data: { role: "coach", status: "active" } });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ name: "Groupe A" }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Plan Pro requis pour gerer les groupes.");
  });

  it("allows pro coach", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({ data: { id: "user-1", org_id: "org-1" } });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({ data: { role: "coach", status: "active" } });
        }
        if (table === "org_groups") {
          return buildInsertSingle({ data: { id: "group-1" }, error: null });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ name: "Groupe A" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groupId).toBe("group-1");
  });
});
