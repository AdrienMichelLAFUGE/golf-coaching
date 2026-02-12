import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

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

const buildOrgProposalsSelect = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      order: async () => result,
    };
    return chain;
  },
});

describe("GET /api/orgs/students/pending-links", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns unauthorized when there is no authenticated user", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: "Unauthorized" },
        }),
      },
    };
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({ from: jest.fn() });

    const response = await GET({} as Request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
  });

  it("returns only pending cross-org link requests requested by current org", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "11111111-1111-1111-1111-111111111111", org_id: "org-requester" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { status: "active" },
            error: null,
          });
        }
        if (table === "org_proposals") {
          return buildOrgProposalsSelect({
            data: [
              {
                id: "proposal-1",
                created_at: "2026-02-12T10:00:00.000Z",
                payload: {
                  kind: "student_link_request",
                  requester_org_id: "org-requester",
                  requested_student: {
                    first_name: "Camille",
                    last_name: "Dupont",
                    email: "camille@example.com",
                    playing_hand: "right",
                  },
                },
              },
              {
                id: "proposal-2",
                created_at: "2026-02-12T09:00:00.000Z",
                payload: {
                  kind: "student_link_request",
                  requester_org_id: "org-other",
                  requested_student: {
                    first_name: "Autre",
                    email: "autre@example.com",
                  },
                },
              },
              {
                id: "proposal-3",
                created_at: "2026-02-12T08:00:00.000Z",
                payload: {
                  kind: "proposal_generic",
                  requester_org_id: "org-requester",
                },
              },
            ],
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET({} as Request);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      requests: Array<{
        proposal_id: string;
        first_name: string;
        email: string | null;
      }>;
    };
    expect(body.requests).toEqual([
      expect.objectContaining({
        proposal_id: "proposal-1",
        first_name: "Camille",
        email: "camille@example.com",
      }),
    ]);
  });
});
