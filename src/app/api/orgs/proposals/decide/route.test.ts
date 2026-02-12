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

const buildSelectList = (result: QueryResult) => ({
  select: () => ({
    eq: async () => result,
  }),
});

describe("POST /api/orgs/proposals/decide", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("blocks decision when coach is not assigned", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "user-1", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: { plan_tier: "pro" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "coach", status: "active", premium_active: true },
            error: null,
          });
        }
        if (table === "org_proposals") {
          return buildSelectSingle({
            data: {
              id: "proposal-1",
              org_id: "org-1",
              student_id: "student-1",
              created_by: "coach-2",
              status: "pending",
              payload: {},
            },
            error: null,
          });
        }
        if (table === "student_assignments") {
          return buildSelectList({ data: [], error: null });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        proposalId: "11111111-1111-1111-1111-111111111111",
        decision: "accept",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
  });

  it("blocks student link request decision for non-admin", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "user-1", org_id: "org-owner" },
            error: null,
          });
        }
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: { plan_tier: "pro" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "coach", status: "active", premium_active: true },
            error: null,
          });
        }
        if (table === "org_proposals") {
          return buildSelectSingle({
            data: {
              id: "proposal-2",
              org_id: "org-owner",
              student_id: "student-owner",
              created_by: "coach-target",
              status: "pending",
              payload: {
                kind: "student_link_request",
                requester_user_id: "11111111-1111-1111-1111-111111111111",
                requester_org_id: "22222222-2222-2222-2222-222222222222",
                requested_student: {
                  first_name: "Camille",
                  last_name: "Dupont",
                  email: "camille@example.com",
                  playing_hand: "right",
                },
              },
            },
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        proposalId: "11111111-1111-1111-1111-111111111111",
        decision: "accept",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe(
      "Seul l admin de l organisation proprietaire peut valider cette demande."
    );
  });
});
