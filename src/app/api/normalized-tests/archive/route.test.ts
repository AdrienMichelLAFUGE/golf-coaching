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
      get: (key: string) =>
        key.toLowerCase() === "authorization" ? "Bearer token" : null,
    },
  }) as unknown as Request;

const buildSelectSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      single: async () => result,
    }),
  }),
});

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => result,
    };
    return chain;
  },
});

const buildUpdate = (result: { error?: { message?: string } | null }) => ({
  update: () => ({
    eq: async () => result,
  }),
});

describe("POST /api/normalized-tests/archive", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
  });

  it("archives assignment when allowed", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "coach-1", org_id: "org-1", role: "coach" },
            error: null,
          });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    };

    const admin = {
      from: (table: string) => {
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: { plan_tier: "standard" },
            error: null,
          });
        }
        if (table === "normalized_test_assignments") {
          return {
            ...buildSelectMaybeSingle({
              data: { id: "assign-1", org_id: "org-1", test_slug: "pelz-putting" },
              error: null,
            }),
            ...buildUpdate({ error: null }),
          };
        }
        return buildSelectSingle({ data: null, error: null });
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ assignmentId: "11111111-1111-1111-1111-111111111111" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
