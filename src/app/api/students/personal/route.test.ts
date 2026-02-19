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
  select: () => ({
    eq: () => ({
      maybeSingle: async () => result,
    }),
  }),
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
          return buildSelectMaybeSingle({
            data: {
              id: "org-personal",
              workspace_type: "personal",
              owner_profile_id: "user-1",
            },
            error: null,
          });
        }
        if (table === "students") {
          return {
            insert: studentInsert,
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
});
