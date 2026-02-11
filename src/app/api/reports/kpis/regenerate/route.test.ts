import { POST } from "./route";

jest.mock("server-only", () => ({}));

const generateReportKpisForPublishedReport = jest.fn();
jest.mock("@/lib/ai/report-kpis", () => ({
  generateReportKpisForPublishedReport: (...args: unknown[]) =>
    generateReportKpisForPublishedReport(...args),
}));

jest.mock("@/lib/plan-access", () => ({
  loadPersonalPlanTier: async () => "pro",
}));

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
  from: (table: string) => {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => {
        single: () => Promise<QueryResult>;
        maybeSingle?: () => Promise<QueryResult>;
      };
    };
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: { get: () => null },
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
      single: async () => result,
    };
    return chain;
  },
});

describe("POST /api/reports/kpis/regenerate", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  const buildThenable = <T,>(value: T): PromiseLike<T> => ({
    then: (onfulfilled, onrejected) => Promise.resolve(value).then(onfulfilled, onrejected),
  });

  beforeEach(() => {
    generateReportKpisForPublishedReport.mockReset();
    generateReportKpisForPublishedReport.mockResolvedValue({ status: "ready" });
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => buildSelectSingle({ data: null, error: null }),
    } as unknown as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest({ reportId: "00000000-0000-0000-0000-000000000001" }));
    expect(response.status).toBe(401);
  });

  it("returns 403 when coach is not assigned in org workspace", async () => {
    const orgId = "00000000-0000-0000-0000-000000000010";
    const studentOrgId = "00000000-0000-0000-0000-000000000101";
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "reports") {
          return buildSelectSingle({
            data: {
              id: "report-1",
              org_id: orgId,
              student_id: studentOrgId,
              sent_at: "2026-02-09T10:00:00Z",
            },
            error: null,
          });
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: orgId }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as unknown as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return buildSelectSingle({
            data: { id: orgId, workspace_type: "org", owner_profile_id: null },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "coach", status: "active" },
            error: null,
          });
        }
        if (table === "student_accounts") {
          return buildSelectMaybeSingle({ data: null, error: null });
        }
        if (table === "students") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({
                  data: [{ id: studentOrgId, org_id: orgId }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "student_assignments") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ reportId: "00000000-0000-0000-0000-000000000001" }));
    expect(response.status).toBe(403);
    expect(generateReportKpisForPublishedReport).not.toHaveBeenCalled();
  });

  it("returns 200 and triggers KPI generation when authorized", async () => {
    const orgId = "00000000-0000-0000-0000-000000000010";
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "reports") {
          return buildSelectSingle({
            data: {
              id: "report-1",
              org_id: orgId,
              student_id: "student-1",
              sent_at: "2026-02-09T10:00:00Z",
            },
            error: null,
          });
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: orgId }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as unknown as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return buildSelectSingle({
            data: { id: orgId, workspace_type: "personal", owner_profile_id: "user-1" },
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ reportId: "00000000-0000-0000-0000-000000000001" }));
    expect(response.status).toBe(200);
    expect(generateReportKpisForPublishedReport).toHaveBeenCalled();
  });

  it("allows regeneration in org workspace for a report linked to an org student", async () => {
    const orgId = "00000000-0000-0000-0000-000000000010";
    const personalOrgId = "00000000-0000-0000-0000-000000000020";
    const studentPersonalId = "00000000-0000-0000-0000-000000000201";
    const studentUserId = "00000000-0000-0000-0000-000000000202";
    const studentOrgId = "00000000-0000-0000-0000-000000000203";
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "reports") {
          // Report belongs to another workspace, but should be accessible via linked student.
          return buildSelectSingle({
            data: {
              id: "report-1",
              org_id: personalOrgId,
              student_id: studentPersonalId,
              sent_at: "2026-02-09T10:00:00Z",
            },
            error: null,
          });
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: orgId }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as unknown as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return buildSelectSingle({
            data: { id: orgId, workspace_type: "org", owner_profile_id: null },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "coach", status: "active" },
            error: null,
          });
        }
        if (table === "student_accounts") {
          return {
            select: () => {
              const chain: {
                eq: (col: string) => unknown;
                maybeSingle: () => Promise<{ data: unknown; error: null }>;
              } = {
                eq: (col: string) => {
                  if (col === "student_id") return chain;
                  // Second query: `.eq("user_id", ...)` is awaited directly.
                  if (col === "user_id") {
                    return buildThenable({
                      data: [
                        { student_id: studentPersonalId, user_id: studentUserId },
                        { student_id: studentOrgId, user_id: studentUserId },
                      ],
                      error: null,
                    });
                  }
                  return chain;
                },
                maybeSingle: async () => ({
                  data: { student_id: studentPersonalId, user_id: studentUserId },
                  error: null,
                }),
              };

              return chain;
            },
          };
        }
        if (table === "students") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({
                  data: [{ id: studentOrgId, org_id: orgId }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "student_assignments") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({ data: [{ coach_id: "user-1" }], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ reportId: "00000000-0000-0000-0000-000000000001" })
    );
    expect(response.status).toBe(200);
    expect(generateReportKpisForPublishedReport).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: personalOrgId, studentId: studentPersonalId })
    );
  });
});
