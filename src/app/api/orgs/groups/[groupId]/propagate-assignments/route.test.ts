import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/plan-access", () => ({
  loadPersonalPlanTier: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: unknown | null;
    }>;
  };
};

const buildRequest = () =>
  ({
    json: async () => ({}),
  }) as Request;

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

const buildSelectList = (result: QueryResult) => ({
  select: () => ({
    eq: async () => result,
  }),
});

describe("POST /api/orgs/groups/[groupId]/propagate-assignments", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const planMocks = jest.requireMock("@/lib/plan-access") as {
    loadPersonalPlanTier: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    planMocks.loadPersonalPlanTier.mockReset();
  });

  it("propagates assignments without duplicates", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const upsertAssignments = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({ data: { id: "user-1", org_id: "org-1" } });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({ data: { role: "coach", status: "active" } });
        }
        if (table === "org_groups") {
          return buildSelectMaybeSingle({ data: { id: "group-1" } });
        }
        if (table === "org_group_students") {
          return buildSelectList({
            data: [{ student_id: "student-1" }, { student_id: "student-2" }],
          });
        }
        if (table === "org_group_coaches") {
          return buildSelectList({
            data: [{ coach_id: "coach-1" }, { coach_id: "coach-2" }],
          });
        }
        if (table === "student_assignments") {
          return { upsert: upsertAssignments };
        }
        return buildSelectList({ data: [], error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest(), { params: { groupId: "group-1" } });

    expect(response.status).toBe(200);
    expect(upsertAssignments).toHaveBeenCalledWith(
      [
        {
          org_id: "org-1",
          student_id: "student-1",
          coach_id: "coach-1",
          created_by: "user-1",
        },
        {
          org_id: "org-1",
          student_id: "student-1",
          coach_id: "coach-2",
          created_by: "user-1",
        },
        {
          org_id: "org-1",
          student_id: "student-2",
          coach_id: "coach-1",
          created_by: "user-1",
        },
        {
          org_id: "org-1",
          student_id: "student-2",
          coach_id: "coach-2",
          created_by: "user-1",
        },
      ],
      { onConflict: "student_id,coach_id", ignoreDuplicates: true }
    );
  });
});
