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

const buildRequest = (url = "http://localhost/api/admin/logs") =>
  ({
    url,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("GET /api/admin/logs", () => {
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
    if (!response) throw new Error("Missing response");

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 500 when logs query fails", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const logsChain = {
      gte: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      eq: jest.fn(),
    };
    logsChain.gte.mockReturnValue(logsChain);
    logsChain.order.mockReturnValue(logsChain);
    logsChain.eq.mockReturnValue(logsChain);
    logsChain.limit.mockResolvedValue({ data: null, error: { message: "logs-error" } });

    const admin = {
      from: jest.fn(() => ({
        select: jest.fn(() => logsChain),
      })),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest());
    if (!response) throw new Error("Missing response");

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("logs-error");
  });

  it("returns enriched logs", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const logsChain = {
      gte: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      eq: jest.fn(),
    };
    logsChain.gte.mockReturnValue(logsChain);
    logsChain.order.mockReturnValue(logsChain);
    logsChain.eq.mockReturnValue(logsChain);
    logsChain.limit.mockResolvedValue({
      data: [
        {
          id: "log-1",
          created_at: "2026-02-13T10:00:00.000Z",
          level: "info",
          action: "report.publish.success",
          source: "api",
          actor_user_id: "coach-1",
          org_id: "org-1",
          entity_type: "report",
          entity_id: "rep-1",
          message: "Rapport publie.",
          metadata: { reportId: "rep-1" },
        },
      ],
      error: null,
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "app_activity_logs") {
          return { select: jest.fn(() => logsChain) };
        }
        if (table === "profiles") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [{ id: "coach-1", full_name: "Coach Test" }],
                error: null,
              }),
            })),
          };
        }
        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [{ id: "org-1", name: "Org Test" }],
                error: null,
              }),
            })),
          };
        }
        if (table === "student_accounts") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(
      buildRequest("http://localhost/api/admin/logs?level=info&q=publie")
    );
    if (!response) throw new Error("Missing response");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].action).toBe("report.publish.success");
    expect(body.logs[0].actorName).toBe("Coach Test");
    expect(body.logs[0].orgName).toBe("Org Test");
  });

  it("falls back to linked student full name when actor profile name is empty", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const logsChain = {
      gte: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      eq: jest.fn(),
    };
    logsChain.gte.mockReturnValue(logsChain);
    logsChain.order.mockReturnValue(logsChain);
    logsChain.eq.mockReturnValue(logsChain);
    logsChain.limit.mockResolvedValue({
      data: [
        {
          id: "log-1",
          created_at: "2026-02-13T10:00:00.000Z",
          level: "info",
          action: "student.updated",
          source: "db",
          actor_user_id: "student-user-1",
          org_id: "org-1",
          entity_type: "students",
          entity_id: "student-1",
          message: "Eleve modifie.",
          metadata: {},
        },
      ],
      error: null,
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "app_activity_logs") {
          return { select: jest.fn(() => logsChain) };
        }
        if (table === "profiles") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [{ id: "student-user-1", full_name: null }],
                error: null,
              }),
            })),
          };
        }
        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [{ id: "org-1", name: "Org Test" }],
                error: null,
              }),
            })),
          };
        }
        if (table === "student_accounts") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [{ user_id: "student-user-1", student_id: "student-1" }],
                error: null,
              }),
            })),
          };
        }
        if (table === "students") {
          return {
            select: jest.fn(() => ({
              in: async () => ({
                data: [{ id: "student-1", first_name: "Camille", last_name: "Dupont" }],
                error: null,
              }),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest());
    if (!response) throw new Error("Missing response");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].actorName).toBe("Camille Dupont");
  });
});
