import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

type AdminClient = {
  from: (table: string) => {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => {
        order: (...args: unknown[]) => Promise<QueryResult>;
      };
    };
  };
};

const buildRequest = () =>
  ({
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("GET /api/pricing", () => {
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

    const response = await GET(buildRequest());
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 500 when pricing lookup fails", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest());
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("boom");
  });
});
