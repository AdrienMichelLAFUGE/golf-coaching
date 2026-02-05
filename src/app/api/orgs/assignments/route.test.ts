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

describe("POST /api/orgs/assignments", () => {
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

  it("allows active member to update assignments", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
          error: null,
        }),
      },
    };

    planMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const deleteAssignments = jest.fn(() => ({
      eq: async () => ({ error: null }),
    }));
    const insertAssignments = jest.fn(async () => ({ error: null }));

    let membershipCall = 0;
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "11111111-1111-1111-1111-111111111111", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          membershipCall += 1;
          if (membershipCall === 1) {
            return buildSelectMaybeSingle({
              data: { status: "active" },
              error: null,
            });
          }
          return buildSelectListWithIn({
            data: [
              { user_id: "11111111-1111-1111-1111-111111111111" },
              { user_id: "22222222-2222-2222-2222-222222222222" },
            ],
            error: null,
          });
        }
        if (table === "students") {
          return buildSelectSingle({
            data: { id: "33333333-3333-3333-3333-333333333333", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "student_assignments") {
          return { delete: deleteAssignments, insert: insertAssignments };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        studentId: "33333333-3333-3333-3333-333333333333",
        coachIds: [
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(deleteAssignments).toHaveBeenCalled();
    expect(insertAssignments).toHaveBeenCalledWith([
      {
        org_id: "org-1",
        student_id: "33333333-3333-3333-3333-333333333333",
        coach_id: "11111111-1111-1111-1111-111111111111",
        created_by: "11111111-1111-1111-1111-111111111111",
      },
      {
        org_id: "org-1",
        student_id: "33333333-3333-3333-3333-333333333333",
        coach_id: "22222222-2222-2222-2222-222222222222",
        created_by: "11111111-1111-1111-1111-111111111111",
      },
    ]);
  });
});
