import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

describe("GET /api/coach/events", () => {
  const USER_ID = "11111111-1111-1111-1111-111111111111";
  const WORKSPACE_ID = "22222222-2222-2222-2222-222222222222";
  const STUDENT_ID_A = "33333333-3333-3333-3333-333333333333";
  const STUDENT_ID_B = "44444444-4444-4444-4444-444444444444";

  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 422 when range exceeds 120 days", async () => {
    const response = await GET(
      {
        url:
          "http://localhost/api/coach/events?from=2026-01-01T00:00:00.000Z&to=2026-06-01T00:00:00.000Z",
      } as Request
    );

    expect(response.status).toBe(422);
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("returns 401 when session is invalid", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: "Unauthorized" },
        }),
      },
    });

    const response = await GET(
      {
        url:
          "http://localhost/api/coach/events?from=2026-02-01T00:00:00.000Z&to=2026-02-20T00:00:00.000Z",
      } as Request
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when caller is a student", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "11111111-1111-1111-1111-111111111111", email: "a@b.c" } },
          error: null,
        }),
      },
    });

    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table !== "profiles") return {};
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "11111111-1111-1111-1111-111111111111",
                  role: "student",
                  org_id: "22222222-2222-2222-2222-222222222222",
                  active_workspace_id: "22222222-2222-2222-2222-222222222222",
                },
                error: null,
              }),
            }),
          }),
        };
      }),
    });

    const response = await GET(
      {
        url:
          "http://localhost/api/coach/events?from=2026-02-01T00:00:00.000Z&to=2026-02-20T00:00:00.000Z",
      } as Request
    );

    expect(response.status).toBe(403);
  });

  it("returns events with student metadata and students list", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_ID, email: "coach@swingflow.fr" } },
          error: null,
        }),
      },
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: USER_ID,
                    role: "coach",
                    org_id: WORKSPACE_ID,
                    active_workspace_id: WORKSPACE_ID,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: WORKSPACE_ID,
                    workspace_type: "personal",
                    owner_profile_id: USER_ID,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "students") {
          return {
            select: (columns: string) => {
              if (columns === "id") {
                return {
                  eq: async () => ({
                    data: [{ id: STUDENT_ID_A }, { id: STUDENT_ID_B }],
                    error: null,
                  }),
                };
              }
              return {
                in: async () => ({
                  data: [
                    {
                      id: STUDENT_ID_A,
                      first_name: "Alice",
                      last_name: "Martin",
                      avatar_url: "https://cdn.test/alice.png",
                    },
                    {
                      id: STUDENT_ID_B,
                      first_name: "Benoit",
                      last_name: "Durand",
                      avatar_url: null,
                    },
                  ],
                  error: null,
                }),
              };
            },
          };
        }

        if (table === "student_shares") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
                ilike: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }

        if (table === "student_events") {
          return {
            select: () => ({
              in: () => ({
                lte: () => ({
                  is: async () => ({
                    data: [
                      {
                        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                        student_id: STUDENT_ID_A,
                        title: "Tournoi regional",
                        type: "tournament",
                        start_at: "2026-02-16T08:00:00.000Z",
                        end_at: null,
                        all_day: true,
                        location: "Golf Club",
                        notes: null,
                        created_by: USER_ID,
                        updated_by: USER_ID,
                        created_at: "2026-02-10T10:00:00.000Z",
                        updated_at: "2026-02-10T10:00:00.000Z",
                        version: 1,
                        results_enabled: false,
                        results_rounds_planned: null,
                        results_rounds: [],
                      },
                    ],
                    error: null,
                  }),
                  not: () => ({
                    gte: async () => ({
                      data: [
                        {
                          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                          student_id: STUDENT_ID_B,
                          title: "Session technique",
                          type: "training",
                          start_at: "2026-02-17T10:00:00.000Z",
                          end_at: "2026-02-17T12:00:00.000Z",
                          all_day: false,
                          location: "Practice",
                          notes: "Travail trajectoire",
                          created_by: USER_ID,
                          updated_by: USER_ID,
                          created_at: "2026-02-10T10:00:00.000Z",
                          updated_at: "2026-02-10T10:00:00.000Z",
                          version: 2,
                          results_enabled: false,
                          results_rounds_planned: null,
                          results_rounds: [],
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      }),
      rpc: jest.fn(async (_fn: string, params: { _student_id: string }) => ({
        data: [params._student_id],
        error: null,
      })),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(
      {
        url:
          "http://localhost/api/coach/events?from=2026-02-01T00:00:00.000Z&to=2026-02-20T00:00:00.000Z",
      } as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.students).toEqual([
      {
        id: STUDENT_ID_A,
        name: "Alice Martin",
        avatarUrl: "https://cdn.test/alice.png",
      },
      {
        id: STUDENT_ID_B,
        name: "Benoit Durand",
        avatarUrl: null,
      },
    ]);

    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toEqual(
      expect.objectContaining({
        studentId: STUDENT_ID_A,
        studentName: "Alice Martin",
        studentAvatarUrl: "https://cdn.test/alice.png",
      })
    );
    expect(body.events[1]).toEqual(
      expect.objectContaining({
        studentId: STUDENT_ID_B,
        studentName: "Benoit Durand",
        studentAvatarUrl: null,
      })
    );
  });
});
