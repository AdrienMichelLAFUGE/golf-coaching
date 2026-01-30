import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

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
      gte?: (...args: unknown[]) => {
        order?: (...args: unknown[]) => {
          limit?: (
            ...args: unknown[]
          ) => Promise<{ data: unknown; error?: { message?: string } | null }>;
        };
      };
    };
  };
};

const buildRequest = (url = "http://localhost/api/admin/analytics") =>
  ({
    url,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("GET /api/admin/analytics", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 403 when user is not admin", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await GET(buildRequest());
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 500 when usage query fails", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      from: () => ({
        select: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({
                data: null,
                error: { message: "usage-error" },
              }),
            }),
          }),
        }),
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(
      buildRequest("http://localhost/api/admin/analytics?days=7")
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("usage-error");
  });
});
