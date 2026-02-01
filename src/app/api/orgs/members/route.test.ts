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
  select: () => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => result,
      }),
    }),
  }),
});

const buildSelectList = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        eq: async () => result,
      }),
    }),
  }),
});

describe("PATCH /api/orgs/members", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("rejects promotion to admin when another admin exists", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "admin@example.com" } },
          error: null,
        }),
      },
    };

    let membershipCall = 0;
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "user-1", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          membershipCall += 1;
          if (membershipCall === 1) {
            return buildSelectMaybeSingle({
              data: { role: "admin", status: "active" },
              error: null,
            });
          }
          if (membershipCall === 2) {
            return buildSelectMaybeSingle({
              data: {
                id: "member-1",
                role: "coach",
                status: "active",
                premium_active: true,
              },
              error: null,
            });
          }
          return buildSelectList({
            data: [{ id: "other-admin" }],
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({
        memberId: "11111111-1111-1111-1111-111111111111",
        role: "admin",
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Un admin actif existe deja.");
  });
});
