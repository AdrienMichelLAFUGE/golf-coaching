import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/student-events/access", () => ({
  resolveStudentEventAccess: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const COACH_ID = "44444444-4444-4444-4444-444444444444";

describe("students/[studentId]/events route", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const accessMocks = jest.requireMock("@/lib/student-events/access") as {
    resolveStudentEventAccess: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    accessMocks.resolveStudentEventAccess.mockReset();
  });

  it("returns 422 when GET range exceeds 120 days", async () => {
    const response = await GET(
      {
        url:
          "http://localhost/api/students/" +
          STUDENT_ID +
          "/events?from=2026-01-01T00:00:00.000Z&to=2026-06-01T00:00:00.000Z",
      } as Request,
      { params: { studentId: STUDENT_ID } }
    );

    expect(response.status).toBe(422);
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when GET caller is not allowed to read", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1" } },
          error: null,
        }),
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({});
    accessMocks.resolveStudentEventAccess.mockResolvedValue({
      canRead: false,
      canWrite: false,
      reason: "forbidden",
    });

    const response = await GET(
      {
        url:
          "http://localhost/api/students/" +
          STUDENT_ID +
          "/events?from=2026-02-01T00:00:00.000Z&to=2026-02-20T00:00:00.000Z",
      } as Request,
      { params: { studentId: STUDENT_ID } }
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when POST caller is not allowed to write", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1" } },
          error: null,
        }),
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({});
    accessMocks.resolveStudentEventAccess.mockResolvedValue({
      canRead: true,
      canWrite: false,
      reason: "coach_linked",
    });

    const response = await POST(
      {
        json: async () => ({
          title: "Tournoi de printemps",
          type: "tournament",
          startAt: "2026-02-20T09:00:00.000Z",
          endAt: "2026-02-20T18:00:00.000Z",
          allDay: false,
          location: "Golf Club",
          notes: "Preparation competition",
        }),
      } as Request,
      { params: { studentId: STUDENT_ID } }
    );

    expect(response.status).toBe(403);
  });

  it("allows POST when caller is linked coach with write access", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: COACH_ID, email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const createdRow = {
      id: "22222222-2222-2222-2222-222222222222",
      student_id: STUDENT_ID,
      title: "Tournoi de printemps",
      type: "tournament",
      start_at: "2026-02-20T09:00:00.000Z",
      end_at: "2026-02-20T18:00:00.000Z",
      all_day: false,
      location: "Golf Club",
      notes: "Preparation competition",
      created_by: COACH_ID,
      updated_by: COACH_ID,
      created_at: "2026-02-10T10:00:00.000Z",
      updated_at: "2026-02-10T10:00:00.000Z",
      version: 1,
      results_enabled: false,
      results_rounds_planned: null,
      results_rounds: [],
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "student_events") return {};
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: createdRow, error: null }),
            }),
          }),
        };
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.resolveStudentEventAccess.mockResolvedValue({
      canRead: true,
      canWrite: true,
      reason: "coach_linked",
    });

    const response = await POST(
      {
        json: async () => ({
          title: "Tournoi de printemps",
          type: "tournament",
          startAt: "2026-02-20T09:00:00.000Z",
          endAt: "2026-02-20T18:00:00.000Z",
          allDay: false,
          location: "Golf Club",
          notes: "Preparation competition",
          resultsEnabled: false,
          resultsRoundsPlanned: null,
          resultsRounds: [],
        }),
      } as Request,
      { params: { studentId: STUDENT_ID } }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.event.createdBy).toBe(COACH_ID);
    expect(body.event.studentId).toBe(STUDENT_ID);
  });

  it("returns 422 when POST enables results on unsupported event type", async () => {
    const response = await POST(
      {
        json: async () => ({
          title: "Bloc technique",
          type: "training",
          startAt: "2026-02-20T09:00:00.000Z",
          endAt: "2026-02-20T18:00:00.000Z",
          allDay: false,
          location: "Practice",
          notes: "Test",
          resultsEnabled: true,
          resultsRoundsPlanned: 2,
          resultsRounds: [],
        }),
      } as Request,
      { params: { studentId: STUDENT_ID } }
    );

    expect(response.status).toBe(422);
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });
});
