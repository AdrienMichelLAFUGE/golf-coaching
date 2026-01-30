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

const buildRequest = (url: string) =>
  ({
    url,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("GET /api/admin/analytics/coach", () => {
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

    const response = await GET(
      buildRequest("http://localhost/api/admin/analytics/coach")
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
  });

  it("returns 400 when userId is missing", async () => {
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

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({});

    const response = await GET(
      buildRequest("http://localhost/api/admin/analytics/coach")
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing userId.");
  });
});
