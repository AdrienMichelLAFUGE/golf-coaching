import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
  from: (table: string) => {
    select?: (...args: unknown[]) => {
      eq: (...args: unknown[]) => { maybeSingle: () => Promise<QueryResult> };
    };
    update?: (...args: unknown[]) => {
      eq: (...args: unknown[]) => {
        eq: (...args: unknown[]) => {
          select: () => { maybeSingle: () => Promise<QueryResult> };
        };
      };
    };
  };
};

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

describe("POST /api/student-shares/revoke", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
  });

  it("blocks revoke when viewer has no permission", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "student_shares") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "share-1", status: "active" },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: null,
                      error: { message: "permission denied" },
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest({ shareId: "share-1" }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
  });

  it("allows owner to revoke an active share", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "owner-1", email: "owner@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "student_shares") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "share-2", status: "active" },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { id: "share-2", status: "revoked" },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest({ shareId: "share-2" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("revoked");
  });
});
