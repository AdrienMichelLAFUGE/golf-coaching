import { DELETE, GET, PATCH } from "./route";

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
      data: { user: { id?: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (query = "", headers?: Record<string, string>) =>
  ({
    url: `https://example.test/api/admin/bug-reports${query ? `?${query}` : ""}`,
    headers: {
      get: (key: string) => {
        const lower = key.toLowerCase();
        return headers?.[lower] ?? headers?.[key] ?? null;
      },
    },
  }) as Request;

const buildJsonRequest = (payload: unknown) =>
  ({
    url: "https://example.test/api/admin/bug-reports",
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("/api/admin/bug-reports", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("GET returns 403 when user is not admin", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { email: "coach@example.com" } },
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
  });

  it("GET returns bug reports for admin user", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const queryState = {
      rows: [
        {
          id: "bug-1",
          created_at: "2026-02-19T10:00:00.000Z",
          reporter_user_id: "coach-1",
          workspace_org_id: "org-1",
          reporter_role: "coach",
          title: "Bug import",
          description: "Le tableau est vide apres extraction.",
          request_type: "bug",
          severity: "high",
          status: "new",
          page_path: "/app/coach/rapports/nouveau",
          user_agent: "jest-agent",
          context: { viewportWidth: 1200 },
          resolved_at: null,
        },
      ],
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "bug_reports") {
          const builder = {
            gte: () => builder,
            order: () => builder,
            eq: () => builder,
            limit: async () => ({
              data: queryState.rows,
              error: null,
            }),
          };
          return {
            select: () => builder,
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: "coach-1", full_name: "Coach Test" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: "org-1", name: "Org Test" }],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest("status=new&severity=high&requestType=bug"));
    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reports: Array<{
        reporterName: string | null;
        workspaceOrgName: string | null;
        requestType: string;
      }>;
    };
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].reporterName).toBe("Coach Test");
    expect(body.reports[0].workspaceOrgName).toBe("Org Test");
    expect(body.reports[0].requestType).toBe("bug");
  });

  it("PATCH updates bug status", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "bug_reports") {
          return {
            update: () => ({
              eq: async () => ({
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(buildJsonRequest({ id: "bug-1", status: "in_progress" }));
    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(admin.from).toHaveBeenCalledWith("bug_reports");
  });

  it("DELETE removes bug report", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "bug_reports") {
          return {
            delete: () => ({
              eq: async () => ({
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await DELETE(buildJsonRequest({ id: "bug-1" }));
    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(admin.from).toHaveBeenCalledWith("bug_reports");
  });
});
