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
    insert?: (...args: unknown[]) => Promise<{ error?: { message?: string } | null }>;
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

describe("POST /api/student-shares/invite", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("creates a share invite for owner", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "owner-1", email: "owner@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { role: "owner", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: { id: "student-1", org_id: "org-1", email: "eleve@example.com" },
            error: null,
          });
        }
        if (table === "student_shares") {
          return {
            insert: async () => ({ error: null }),
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(
      buildRequest({ studentId: "student-1", coachEmail: "coach@example.com" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
