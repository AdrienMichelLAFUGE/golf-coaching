import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: {
        user: {
          id: string;
          email?: string;
          user_metadata?: Record<string, unknown>;
        } | null;
      };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (key: string) => {
        const lower = key.toLowerCase();
        return headers?.[lower] ?? headers?.[key] ?? null;
      },
    },
  }) as Request;

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => result,
    }),
    ilike: () => ({
      maybeSingle: async () => result,
    }),
  }),
});

describe("POST /api/onboarding/ensure-profile", () => {
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
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 403 when role hint is invalid", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "user-1",
              email: "user@example.com",
              user_metadata: { role: "student" },
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const orgInsert = jest.fn();
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({ data: null, error: null });
        }
        if (table === "students") {
          return buildSelectMaybeSingle({ data: null, error: null });
        }
        if (table === "organizations") {
          return { insert: orgInsert };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces reserve aux comptes invites.");
    expect(admin.from).not.toHaveBeenCalledWith("organizations");
  });
});
