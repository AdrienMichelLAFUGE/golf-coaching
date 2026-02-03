import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

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

describe("POST /api/orgs", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("blocks creation when freemium", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const orgInsert = jest.fn();
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "user-1", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "organizations") {
          return {
            ...buildSelectMaybeSingle({
              data: { plan_tier: "free" },
              error: null,
            }),
            insert: orgInsert,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ name: "Nouvelle orga" }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Plan Free: creation d organisation indisponible.");
    expect(orgInsert).not.toHaveBeenCalled();
  });

  it("allows creation when plan is paid", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-2", email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const orgInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "org-2" }, error: null }),
      }),
    }));
    const membershipInsert = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "user-2", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "organizations") {
          return {
            ...buildSelectMaybeSingle({
              data: { plan_tier: "standard" },
              error: null,
            }),
            insert: orgInsert,
          };
        }
        if (table === "org_memberships") {
          return { insert: membershipInsert };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ name: "Nouvelle orga" }));

    expect(response.status).toBe(200);
    expect(orgInsert).toHaveBeenCalled();
    expect(membershipInsert).toHaveBeenCalledWith([
      {
        org_id: "org-2",
        user_id: "user-2",
        role: "admin",
        status: "active",
        premium_active: true,
      },
    ]);
  });
});
