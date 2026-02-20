import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/activity-log", () => ({
  recordActivity: jest.fn(async () => undefined),
}));

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (payload: unknown, headers?: Record<string, string>) =>
  ({
    json: async () => payload,
    headers: {
      get: (key: string) => {
        const lower = key.toLowerCase();
        return headers?.[lower] ?? headers?.[key] ?? null;
      },
    },
  }) as Request;

describe("POST /api/bug-reports", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 422 on invalid payload", async () => {
    const response = await POST(buildRequest({ title: "x" }));
    expect(response.status).toBe(422);
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("returns 401 when caller is unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: new Error("Unauthorized"),
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(
      buildRequest({
        title: "Import radar bloque",
        description: "Le tableau reste vide apres extraction.",
        pagePath: "/app/coach/rapports/nouveau",
      })
    );

    expect(response.status).toBe(401);
  });

  it("creates a bug report with authenticated caller", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const bugReportsInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({
          data: {
            id: "report-1",
            created_at: "2026-02-19T12:00:00.000Z",
          },
          error: null,
        }),
      }),
    }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "coach-1",
                    role: "coach",
                    org_id: "org-personal",
                    active_workspace_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "bug_reports") {
          return {
            insert: bugReportsInsert,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest(
        {
          title: "Extraction incoherente",
          description: "Les deux premieres colonnes sont dupliquees et decalent le tableau.",
          requestType: "feature_request",
          severity: "high",
          pagePath: "app/coach/eleves/123",
          context: {
            viewportWidth: 1440,
            viewportHeight: 900,
            language: "fr-FR",
          },
        },
        { "user-agent": "jest-test-agent" }
      )
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { reportId: string };
    expect(body.reportId).toBe("report-1");
    expect(admin.from).toHaveBeenCalledWith("profiles");
    expect(admin.from).toHaveBeenCalledWith("bug_reports");
    expect(bugReportsInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        request_type: "feature_request",
      }),
    ]);
  });
});
