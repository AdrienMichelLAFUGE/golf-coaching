import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/parent/coach-student-access", () => ({
  canCoachLikeAccessStudent: jest.fn(),
}));

jest.mock("@/lib/activity-log", () => ({
  recordActivity: jest.fn(async () => {}),
}));

jest.mock("@/lib/normalized-tests/monitoring", () => ({
  buildNormalizedTestsSummary: jest.fn(() => ({ current: [], history: [] })),
  NormalizedTestAssignmentSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
  NormalizedTestAttemptSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
}));

describe("GET /api/tempo/context", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const accessMocks = jest.requireMock("@/lib/parent/coach-student-access") as {
    canCoachLikeAccessStudent: jest.Mock;
  };

  const studentId = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    accessMocks.canCoachLikeAccessStudent.mockReset();
  });

  it("returns 422 for invalid studentId", async () => {
    const response = await GET(
      {
        url: "https://example.com/api/tempo/context?studentId=nope",
      } as Request
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("studentId invalide.");
  });

  it("returns 403 when access is denied", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1" } },
          error: null,
        }),
      },
      rpc: jest.fn(),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({ from: jest.fn() });
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(false);

    const response = await GET(
      {
        url: `https://example.com/api/tempo/context?studentId=${studentId}`,
      } as Request
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
  });

  it("returns a compact context payload", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1" } },
          error: null,
        }),
      },
      rpc: jest.fn(async () => ({
        data: [studentId],
        error: null,
      })),
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: studentId,
                    first_name: "Jane",
                    last_name: "Doe",
                    email: "jane@example.com",
                    playing_hand: "right",
                    tpi_report_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "tpi_reports") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "reports") {
          return {
            select: () => ({
              in: () => ({
                not: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "radar_files") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "normalized_test_assignments") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const response = await GET(
      {
        url: `https://example.com/api/tempo/context?studentId=${studentId}`,
      } as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.student).toEqual(
      expect.objectContaining({
        id: studentId,
        firstName: "Jane",
        lastName: "Doe",
      })
    );
    expect(body.summaries.reports).toContain("Aucun rapport publie");
    expect(body.aiContext).toContain("Eleve: Jane Doe");
  });

  it("uses latest ready TPI report and test lines in summary", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1" } },
          error: null,
        }),
      },
      rpc: jest.fn(async () => ({
        data: [studentId],
        error: null,
      })),
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: studentId,
                    first_name: "Jane",
                    last_name: "Doe",
                    email: "jane@example.com",
                    playing_hand: "right",
                    tpi_report_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "tpi_reports") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [{ id: "00000000-0000-0000-0000-000000000111", created_at: "2026-02-20T10:00:00.000Z" }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "tpi_tests") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      test_name: "Pelvis Rotation",
                      result_color: "red",
                      mini_summary: "Limitation importante",
                      details: "Rotation tres limitee avec compensation lombaire.",
                      details_translated: "Rotation tres limitee avec compensation lombaire.",
                      position: 1,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "reports") {
          return {
            select: () => ({
              in: () => ({
                not: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "radar_files") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "normalized_test_assignments") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const response = await GET(
      {
        url: `https://example.com/api/tempo/context?studentId=${studentId}`,
      } as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summaries.tpi).toContain("Rouges: 1");
    expect(body.summaries.tpi).toContain("Pelvis Rotation");
    expect(body.summaries.tpi).toContain("Rotation tres limitee");
  });
});
