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

  it("syncs students only inside the targeted group", async () => {
    const studentOne = "11111111-1111-1111-1111-111111111111";
    const studentTwo = "22222222-2222-2222-2222-222222222222";
    const removedStudent = "33333333-3333-3333-3333-333333333333";

    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const selectExistingEqGroup = jest.fn(async () => ({
      data: [{ student_id: studentOne }, { student_id: removedStudent }],
      error: null,
    }));
    const selectExistingEqOrg = jest.fn(() => ({
      eq: selectExistingEqGroup,
    }));
    const selectExistingAssignments = jest.fn(() => ({
      eq: selectExistingEqOrg,
    }));

    const deleteAssignmentsIn = jest.fn(async () => ({ error: null }));
    const deleteAssignmentsEqGroup = jest.fn(() => ({
      in: deleteAssignmentsIn,
    }));
    const deleteAssignmentsEqOrg = jest.fn(() => ({
      eq: deleteAssignmentsEqGroup,
    }));
    const deleteAssignments = jest.fn(() => ({
      eq: deleteAssignmentsEqOrg,
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
              { id: studentOne },
              { id: studentTwo },
            ],
            error: null,
          });
        }
        if (table === "org_group_students") {
          return {
            select: selectExistingAssignments,
            delete: deleteAssignments,
            insert: insertAssignments,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        studentIds: [studentOne, studentTwo],
      }),
      { params: { groupId: "group-1" } }
    );

    expect(response.status).toBe(200);
    expect(selectExistingAssignments).toHaveBeenCalled();
    expect(deleteAssignments).toHaveBeenCalled();
    expect(deleteAssignmentsEqOrg).toHaveBeenCalledWith("org_id", "org-1");
    expect(deleteAssignmentsEqGroup).toHaveBeenCalledWith("group_id", "group-1");
    expect(deleteAssignmentsIn).toHaveBeenCalledWith("student_id", [removedStudent]);
    expect(insertAssignments).toHaveBeenCalledWith([
      {
        org_id: "org-1",
        group_id: "group-1",
        student_id: studentTwo,
        created_by: "user-1",
      },
    ]);
  });
});
