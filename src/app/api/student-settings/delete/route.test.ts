import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseServerClient: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "authorization" ? "Bearer token" : null,
    },
  }) as unknown as Request;

const buildUpdate = (result: { error?: { message?: string } | null }) => ({
  update: () => ({
    eq: () => result,
  }),
});

const buildDoubleUpdate = (result: { error?: { message?: string } | null }) => ({
  update: () => ({
    in: () => ({
      eq: () => result,
    }),
  }),
});

describe("POST /api/student-settings/delete", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseServerClient: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseServerClient.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
  });

  it("anonymizes student account when password is valid", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "student@example.com" } },
          error: null,
        }),
      },
    };

    const authCheck = {
      auth: {
        signInWithPassword: async () => ({ data: { session: {} }, error: null }),
      },
    };

    const admin = {
      auth: {
        admin: {
          updateUserById: async () => ({ data: {}, error: null }),
          signOut: async () => ({ data: null, error: null }),
        },
      },
      from: (table: string) => {
        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ student_id: "student-1" }],
                error: null,
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "students") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: "student-1", avatar_url: null }],
                error: null,
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "student_shares") {
          return buildDoubleUpdate({ error: null });
        }
        if (table === "profiles") {
          return buildUpdate({ error: null });
        }
        return {};
      },
      storage: {
        from: () => ({
          remove: async () => ({ data: [], error: null }),
        }),
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseServerClient.mockReturnValue(authCheck);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ password: "supersecret" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
