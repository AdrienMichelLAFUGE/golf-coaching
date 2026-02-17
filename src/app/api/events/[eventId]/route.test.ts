import { PATCH } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/student-events/access", () => ({
  resolveStudentEventAccess: jest.fn(),
}));

const EVENT_ID = "22222222-2222-2222-2222-222222222222";
const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const STUDENT_USER_ID = "33333333-3333-3333-3333-333333333333";
const COACH_USER_ID = "44444444-4444-4444-4444-444444444444";

const existingEventRow = {
  id: EVENT_ID,
  student_id: STUDENT_ID,
  title: "Competition locale",
  type: "competition",
  start_at: "2026-02-20T09:00:00.000Z",
  end_at: "2026-02-20T12:00:00.000Z",
  all_day: false,
  location: "Golf de Lyon",
  notes: "Objectif top 5",
  created_by: STUDENT_USER_ID,
  updated_by: STUDENT_USER_ID,
  created_at: "2026-02-10T10:00:00.000Z",
  updated_at: "2026-02-10T10:00:00.000Z",
  version: 2,
  results_enabled: false,
  results_rounds_planned: null,
  results_rounds: [],
};

const buildAdmin = (options: {
  loadedRow: Record<string, unknown> | null;
  updatedRow?: Record<string, unknown> | null;
}) => {
  const selectQuery = {
    eq: () => ({
      maybeSingle: async () => ({ data: options.loadedRow, error: null }),
    }),
  };

  const updateQuery = {
    eq: () => ({
      eq: () => ({
        select: () => ({
          maybeSingle: async () => ({
            data: options.updatedRow ?? null,
            error: null,
          }),
        }),
      }),
    }),
  };

  return {
    from: jest.fn((table: string) => {
      if (table !== "student_events") return {};
      return {
        select: () => selectQuery,
        update: () => updateQuery,
      };
    }),
  };
};

describe("PATCH /api/events/[eventId]", () => {
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

  it("returns 409 on stale version and includes server event", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: STUDENT_USER_ID } },
          error: null,
        }),
      },
    };
    const admin = buildAdmin({ loadedRow: existingEventRow });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.resolveStudentEventAccess.mockResolvedValue({
      canRead: true,
      canWrite: true,
      reason: "student",
    });

    const response = await PATCH(
      {
        json: async () => ({
          version: 1,
          title: "Competition locale - maj",
        }),
      } as Request,
      { params: { eventId: EVENT_ID } }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Version conflict.");
    expect(body.event.version).toBe(2);
  });

  it("updates event and increments version when version matches", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: STUDENT_USER_ID } },
          error: null,
        }),
      },
    };
    const admin = buildAdmin({
      loadedRow: existingEventRow,
      updatedRow: {
        ...existingEventRow,
        title: "Competition locale - maj",
        updated_at: "2026-02-10T12:00:00.000Z",
        version: 3,
      },
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.resolveStudentEventAccess.mockResolvedValue({
      canRead: true,
      canWrite: true,
      reason: "student",
    });

    const response = await PATCH(
      {
        json: async () => ({
          version: 2,
          title: "Competition locale - maj",
        }),
      } as Request,
      { params: { eventId: EVENT_ID } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.version).toBe(3);
    expect(body.event.title).toBe("Competition locale - maj");
  });

  it("allows linked coach to update event when access.canWrite is true", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: COACH_USER_ID } },
          error: null,
        }),
      },
    };
    const admin = buildAdmin({
      loadedRow: existingEventRow,
      updatedRow: {
        ...existingEventRow,
        title: "Competition locale - coach",
        updated_by: COACH_USER_ID,
        updated_at: "2026-02-10T12:30:00.000Z",
        version: 3,
      },
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    accessMocks.resolveStudentEventAccess.mockResolvedValue({
      canRead: true,
      canWrite: true,
      reason: "coach_linked",
    });

    const response = await PATCH(
      {
        json: async () => ({
          version: 2,
          title: "Competition locale - coach",
        }),
      } as Request,
      { params: { eventId: EVENT_ID } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.title).toBe("Competition locale - coach");
    expect(body.event.updatedBy).toBe(COACH_USER_ID);
  });
});
