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
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => result,
    };
    return chain;
  },
});

describe("POST /api/students/personal", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when user is not authenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: null,
        }),
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(
      buildRequest({
        first_name: "Camille",
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
  });

  it("creates a student in personal workspace", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    };

    const studentInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({
          data: { id: "student-1" },
          error: null,
        }),
      }),
    }));
    const studentSearch = {
      select: () => ({
        ilike: () => ({
          neq: () => ({
            order: async () => ({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
      insert: studentInsert,
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: {
              id: "user-1",
              org_id: "org-personal",
              active_workspace_id: "org-personal",
            },
            error: null,
          });
        }
        if (table === "organizations") {
          return {
            select: () => {
              const chain = {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "org-personal",
                      workspace_type: "personal",
                      owner_profile_id: "user-1",
                    },
                    error: null,
                  }),
                }),
                in: async () => ({ data: [], error: null }),
              };
              return chain;
            },
          };
        }
        if (table === "students") {
          return studentSearch;
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        first_name: "Camille",
        last_name: "Dupont",
        email: "Camille@example.com",
        playing_hand: "right",
      })
    );

    expect(response.status).toBe(200);
    expect(studentInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: "org-personal",
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
        parent_secret_code_plain: null,
        parent_secret_code_hash: null,
        parent_secret_code_rotated_at: null,
      }),
    ]);
  });

  it("creates a pending personal owner request when student email exists elsewhere", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@new.com" } },
          error: null,
        }),
      },
    };

    const studentInsert = jest.fn();
    const pendingRequestInsert = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: {
              id: "user-1",
              org_id: "org-personal-new",
              active_workspace_id: "org-personal-new",
            },
            error: null,
          });
        }
        if (table === "organizations") {
          return {
            select: () => {
              const chain = {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "org-personal-new",
                      workspace_type: "personal",
                      owner_profile_id: "user-1",
                    },
                    error: null,
                  }),
                }),
                in: async () => ({
                  data: [
                    {
                      id: "org-personal-owner",
                      workspace_type: "personal",
                      owner_profile_id: "owner-2",
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
              ilike: () => ({
                neq: () => ({
                  order: async () => ({
                    data: [
                      {
                        id: "student-owner-1",
                        org_id: "org-personal-owner",
                        first_name: "Camille",
                        last_name: "Dupont",
                        email: "camille@example.com",
                        playing_hand: "right",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            insert: studentInsert,
          };
        }
        if (table === "personal_student_link_requests") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
              };
              return chain;
            },
            insert: pendingRequestInsert,
          };
        }
        if (table === "student_shares") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                ilike: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
              };
              return chain;
            },
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pendingRequest).toBe(true);
    expect(studentInsert).not.toHaveBeenCalled();
    expect(pendingRequestInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        source_student_id: "student-owner-1",
        source_org_id: "org-personal-owner",
        source_owner_user_id: "owner-2",
        requester_org_id: "org-personal-new",
        requester_user_id: "user-1",
        requester_email: "coach@new.com",
        student_email: "camille@example.com",
      }),
    ]);
  });
});
