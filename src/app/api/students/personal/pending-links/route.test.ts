import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

const buildRequest = () =>
  ({
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("GET /api/students/personal/pending-links", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: null,
        }),
      },
    });

    const response = await GET(buildRequest());
    expect(response.status).toBe(401);
  });

  it("returns pending personal link requests for requester coach", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1" } },
          error: null,
        }),
      },
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "coach-1",
                    org_id: "org-1",
                    active_workspace_id: "org-1",
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "organizations") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "org-1",
                    workspace_type: "personal",
                    owner_profile_id: "coach-1",
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "personal_student_link_requests") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                order: async () => ({
                  data: [
                    {
                      id: "request-1",
                      created_at: "2026-02-19T10:00:00.000Z",
                      requested_first_name: "Camille",
                      requested_last_name: "Dupont",
                      student_email: "camille@example.com",
                      requested_playing_hand: "right",
                    },
                  ],
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      requests: Array<{
        proposal_id: string;
        first_name: string;
        last_name: string | null;
        email: string | null;
        playing_hand: string | null;
      }>;
    };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]).toEqual(
      expect.objectContaining({
        proposal_id: "request-1",
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
      })
    );
  });
});
