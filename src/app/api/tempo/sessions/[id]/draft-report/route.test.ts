import { POST } from "./route";

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

const sessionId = "00000000-0000-0000-0000-000000000001";
const studentId = "00000000-0000-0000-0000-000000000101";
const orgId = "00000000-0000-0000-0000-000000000201";
const coachId = "00000000-0000-0000-0000-000000000301";

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as unknown as Request;

const buildAdmin = (options?: { notes?: Array<Record<string, unknown>> }) => {
  const notes = options?.notes ?? [];
  const insertReport = jest.fn(() => ({
    select: () => ({
      single: async () => ({
        data: { id: "00000000-0000-0000-0000-000000000901" },
        error: null,
      }),
    }),
  }));
  const insertSections = jest.fn(async () => ({ error: null }));

  const admin = {
    from: jest.fn((table: string) => {
      if (table === "tempo_sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: sessionId,
                  student_id: studentId,
                  org_id: orgId,
                  coach_id: coachId,
                  mode: "notes",
                  title: "Session Tempo",
                  club: "Fer 7",
                  status: "active",
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }

      if (table === "students") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: studentId,
                  first_name: "John",
                  last_name: "Player",
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "tempo_note_cards") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  order: async () => ({ data: notes, error: null }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "tempo_decision_runs") {
        return {
          select: () => ({
            eq: () => ({
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
          insert: insertReport,
        };
      }

      if (table === "report_sections") {
        return {
          insert: insertSections,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { admin, insertReport, insertSections };
};

describe("POST /api/tempo/sessions/[id]/draft-report", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const accessMocks = jest.requireMock("@/lib/parent/coach-student-access") as {
    canCoachLikeAccessStudent: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    accessMocks.canCoachLikeAccessStudent.mockReset();
  });

  it("returns 401 when user is unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    };
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({ from: jest.fn() });

    const response = await POST(buildRequest({}), { params: { id: sessionId } });
    expect(response.status).toBe(401);
  });

  it("returns 422 when session has no notes and no decision run", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: coachId } }, error: null }),
      },
    };
    const { admin } = buildAdmin();
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const response = await POST(buildRequest({}), { params: { id: sessionId } });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain("Ajoute des notes");
  });

  it("creates a report draft from tempo notes", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: coachId } }, error: null }),
      },
    };
    const { admin, insertReport, insertSections } = buildAdmin({
      notes: [
        {
          id: "00000000-0000-0000-0000-000000000401",
          occurred_at: "2026-02-20T09:30:00.000Z",
          card_type: "constat",
          content: "Angle d attaque trop descendant",
          order_index: 0,
        },
      ],
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const response = await POST(buildRequest({}), { params: { id: sessionId } });

    expect(response.status).toBe(201);
    expect(insertReport).toHaveBeenCalled();
    expect(insertSections).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Notes de seance",
        }),
      ])
    );

    const body = await response.json();
    expect(body).toEqual({ reportId: "00000000-0000-0000-0000-000000000901" });
  });
});
