import { POST } from "./route";
import { WEDGING_DRAPEAU_LONG_SLUG } from "@/lib/normalized-tests/wedging-drapeau-long";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/admin", () => ({
  isAdminEmail: jest.fn(() => false),
}));

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
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "authorization" ? "Bearer token" : null,
    },
  }) as unknown as Request;

const buildSelectChain = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      in: () => chain,
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve: (value: QueryResult) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  },
});

describe("POST /api/normalized-tests/assign-group", () => {
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
          data: { user: { id: "user-1", email: "coach@test.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("free");

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectChain({
            data: { id: "user-1", org_id: "org-1", role: "coach" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectChain({ data: { role: "coach", status: "active" } });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        testSlug: "pelz-putting",
        groupId: "11111111-1111-1111-1111-111111111111",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Plan Pro requis pour gerer les groupes.");
  });

  it("blocks non-pelz test when pelz-only", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@test.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("free");

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectChain({
            data: { id: "user-1", org_id: "org-1", role: "coach" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectChain({ data: { role: "admin", status: "active" } });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        testSlug: WEDGING_DRAPEAU_LONG_SLUG,
        groupId: "11111111-1111-1111-1111-111111111111",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Plan Pro requis pour ce test.");
  });

  it("ignores duplicates", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@test.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const insertMock = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectChain({
            data: { id: "coach-1", org_id: "org-1", role: "coach" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectChain({ data: { role: "coach", status: "active" } });
        }
        if (table === "org_groups") {
          return buildSelectChain({ data: { id: "group-1" }, error: null });
        }
        if (table === "org_group_students") {
          return buildSelectChain({
            data: [
              { student_id: "student-1" },
              { student_id: "student-2" },
              { student_id: "student-3" },
            ],
            error: null,
          });
        }
        if (table === "normalized_test_assignments") {
          return {
            ...buildSelectChain({ data: [{ student_id: "student-2" }], error: null }),
            insert: insertMock,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        testSlug: "pelz-putting",
        groupId: "11111111-1111-1111-1111-111111111111",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1);
  });

  it("returns ok for empty group", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@test.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectChain({
            data: { id: "coach-1", org_id: "org-1", role: "coach" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectChain({ data: { role: "coach", status: "active" } });
        }
        if (table === "org_groups") {
          return buildSelectChain({ data: { id: "group-1" }, error: null });
        }
        if (table === "org_group_students") {
          return buildSelectChain({ data: [], error: null });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        testSlug: "pelz-putting",
        groupId: "11111111-1111-1111-1111-111111111111",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(0);
  });
});
