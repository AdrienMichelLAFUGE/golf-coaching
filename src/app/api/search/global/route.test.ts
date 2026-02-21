import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
}));

type MockSupabase = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown | null;
    }>;
  };
  from: (table: string) => {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => unknown;
    };
  };
};

const buildRequest = (query: string) =>
  ({
    url: `http://localhost/api/search/global?${query}`,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "authorization") return "Bearer test-token";
        return null;
      },
    },
  }) as unknown as Request;

describe("GET /api/search/global", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
  });

  it("returns empty list when query is too short", async () => {
    const response = await GET(buildRequest("q=a"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ query: "a", items: [] });
  });

  it("returns 401 when unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: jest.fn(),
    } as unknown as MockSupabase;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await GET(buildRequest("q=dash"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
  });

  it("returns student quick action results", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "student@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "user-1",
                    role: "student",
                    org_id: "org-1",
                    active_workspace_id: "org-1",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as MockSupabase;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await GET(buildRequest("q=dash"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(
      body.items.some(
        (item: { kind: string; href: string; title: string }) =>
          item.kind === "page" &&
          item.href === "/app/eleve" &&
          item.title === "Dashboard eleve"
      )
    ).toBe(true);
  });
});
