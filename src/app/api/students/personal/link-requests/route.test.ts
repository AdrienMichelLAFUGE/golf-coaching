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

describe("GET /api/students/personal/link-requests", () => {
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

  it("returns pending incoming requests for personal owner coach", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "owner-1" } },
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
                    id: "owner-1",
                    org_id: "org-owner",
                    active_workspace_id: "org-owner",
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
                    id: "org-owner",
                    workspace_type: "personal",
                    owner_profile_id: "owner-1",
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
                      id: "req-1",
                      created_at: "2026-02-19T12:00:00.000Z",
                      source_student_id: "student-1",
                      requester_user_id: "coach-2",
                      requester_email: "coach2@example.com",
                      requested_first_name: "Camille",
                      requested_last_name: "Dupont",
                      student_email: "camille@example.com",
                    },
                  ],
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "students") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "student-1",
                    first_name: "Camille",
                    last_name: "Dupont",
                    email: "camille@example.com",
                  },
                ],
                error: null,
              }),
            }),
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
        requestId: string;
        studentFirstName: string;
        requesterEmail: string;
      }>;
    };

    expect(body.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "req-1",
          studentFirstName: "Camille",
          requesterEmail: "coach2@example.com",
        }),
      ])
    );
  });
});
