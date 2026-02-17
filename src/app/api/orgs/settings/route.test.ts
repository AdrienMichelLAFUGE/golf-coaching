import { PATCH } from "./route";

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

describe("PATCH /api/orgs/settings", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("rejects non-admin members", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const updateFn = jest.fn(() => ({
      eq: async () => ({ error: null }),
    }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: {
              id: "coach-1",
              org_id: "org-personal-1",
              active_workspace_id: "org-1",
            },
            error: null,
          });
        }
        if (table === "organizations") {
          return {
            ...buildSelectMaybeSingle({
              data: {
                id: "org-1",
                name: "Org A",
                workspace_type: "org",
                plan_tier: "pro",
              },
              error: null,
            }),
            update: updateFn,
          };
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

    const response = await PATCH(buildRequest({ name: "Nouveau nom org" }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("updates organization name for admins", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "admin@example.com" } },
          error: null,
        }),
      },
    };

    const updateFn = jest.fn(() => ({
      eq: async () => ({ error: null }),
    }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: {
              id: "admin-1",
              org_id: "org-personal-1",
              active_workspace_id: "org-1",
            },
            error: null,
          });
        }
        if (table === "organizations") {
          return {
            ...buildSelectMaybeSingle({
              data: {
                id: "org-1",
                name: "Org A",
                workspace_type: "org",
                plan_tier: "pro",
              },
              error: null,
            }),
            update: updateFn,
          };
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "admin", status: "active" },
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(buildRequest({ name: "Academie SwingFlow" }));
    expect(response.status).toBe(200);
    expect(updateFn).toHaveBeenCalledWith({ name: "Academie SwingFlow" });
  });
});

