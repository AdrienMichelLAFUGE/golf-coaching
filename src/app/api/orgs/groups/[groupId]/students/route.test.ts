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

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
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

const buildSelectListWithIn = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      in: async () => result,
    };
    return chain;
  },
});

describe("POST /api/orgs/groups/[groupId]/students", () => {
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

  it("reassigns students to a group", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const deleteAssignments = jest.fn(() => ({
      eq: () => ({
        in: async () => ({ error: null }),
      }),
    }));
    const insertAssignments = jest.fn(async () => ({ error: null }));

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
        if (table === "students") {
          return buildSelectListWithIn({
            data: [
              { id: "11111111-1111-1111-1111-111111111111" },
              { id: "22222222-2222-2222-2222-222222222222" },
            ],
            error: null,
          });
        }
        if (table === "org_group_students") {
          return { delete: deleteAssignments, insert: insertAssignments };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        studentIds: [
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ],
      }),
      { params: { groupId: "group-1" } }
    );

    expect(response.status).toBe(200);
    expect(deleteAssignments).toHaveBeenCalled();
    expect(insertAssignments).toHaveBeenCalledWith([
      {
        org_id: "org-1",
        group_id: "group-1",
        student_id: "11111111-1111-1111-1111-111111111111",
        created_by: "user-1",
      },
      {
        org_id: "org-1",
        group_id: "group-1",
        student_id: "22222222-2222-2222-2222-222222222222",
        created_by: "user-1",
      },
    ]);
  });
});
