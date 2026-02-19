import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/plan-access", () => ({
  loadPersonalPlanTier: jest.fn(),
}));

jest.mock("@/lib/org-notifications", () => ({
  createOrgNotifications: jest.fn(),
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

const buildStudentsTable = ({
  searchResult,
  insert,
}: {
  searchResult: QueryResult;
  insert?: jest.Mock;
}) => {
  const table: {
    select: () => {
      ilike: () => {
        neq: () => {
          order: () => {
            limit: () => Promise<QueryResult>;
          };
        };
      };
    };
    insert?: jest.Mock;
  } = {
    select: () => ({
      ilike: () => ({
        neq: () => ({
          order: () => ({
            limit: async () => searchResult,
          }),
        }),
      }),
    }),
  };
  if (insert) table.insert = insert;
  return table;
};

describe("POST /api/orgs/students", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const planAccessMocks = jest.requireMock("@/lib/plan-access") as {
    loadPersonalPlanTier: jest.Mock;
  };
  const notificationMocks = jest.requireMock("@/lib/org-notifications") as {
    createOrgNotifications: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    planAccessMocks.loadPersonalPlanTier.mockReset();
    notificationMocks.createOrgNotifications.mockReset();
  });

  it("blocks creation for free org member", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "user-1", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: { plan_tier: "free" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          return buildSelectMaybeSingle({
            data: { role: "coach", status: "active" },
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    planAccessMocks.loadPersonalPlanTier.mockResolvedValue("free");

    const response = await POST(
      buildRequest({
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Lecture seule: plan Free en organisation.");
  });

  it("allows coach to assign other coaches when creating student", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
          error: null,
        }),
      },
    };

    const studentInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({
          data: { id: "33333333-3333-3333-3333-333333333333" },
          error: null,
        }),
      }),
    }));
    const assignmentsInsert = jest.fn(async () => ({ error: null }));

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
              data: { role: "coach", status: "active" },
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
          return buildStudentsTable({
            searchResult: { data: [], error: null },
            insert: studentInsert,
          });
        }
        if (table === "student_assignments") {
          return { insert: assignmentsInsert };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    planAccessMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const response = await POST(
      buildRequest({
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
        coach_ids: ["22222222-2222-2222-2222-222222222222"],
      })
    );

    expect(response.status).toBe(200);
    expect(studentInsert).toHaveBeenCalled();
    expect(studentInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: "org-1",
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
        parent_secret_code_plain: null,
        parent_secret_code_hash: null,
        parent_secret_code_rotated_at: null,
      }),
    ]);
    expect(assignmentsInsert).toHaveBeenCalledWith([
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

  it("creates a cross-org link request when student email already exists elsewhere", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
          error: null,
        }),
      },
    };

    const studentInsert = jest.fn();
    const proposalInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({
          data: { id: "proposal-1" },
          error: null,
        }),
      }),
    }));

    let membershipCall = 0;
    let orgCall = 0;
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectSingle({
            data: { id: "11111111-1111-1111-1111-111111111111", org_id: "org-2" },
            error: null,
          });
        }
        if (table === "org_memberships") {
          membershipCall += 1;
          if (membershipCall === 1) {
            return buildSelectMaybeSingle({
              data: { role: "coach", status: "active" },
              error: null,
            });
          }
          return buildSelectMaybeSingle({
            data: { user_id: "admin-owner-1" },
            error: null,
          });
        }
        if (table === "students") {
          return buildStudentsTable({
            searchResult: {
              data: [
                {
                  id: "student-owner-1",
                  org_id: "org-1",
                  first_name: "Camille",
                  last_name: "Dupont",
                  email: "camille@example.com",
                },
              ],
              error: null,
            },
            insert: studentInsert,
          });
        }
        if (table === "organizations") {
          orgCall += 1;
          if (orgCall === 1) {
            return buildSelectMaybeSingle({
              data: { name: "Academie Cible" },
              error: null,
            });
          }
          return buildSelectMaybeSingle({
            data: { name: "Academie Cible" },
            error: null,
          });
        }
        if (table === "org_proposals") {
          return { insert: proposalInsert };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    planAccessMocks.loadPersonalPlanTier.mockResolvedValue("pro");

    const response = await POST(
      buildRequest({
        first_name: "Camille",
        last_name: "Dupont",
        email: "camille@example.com",
        playing_hand: "right",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pendingRequest).toBe(true);
    expect(studentInsert).not.toHaveBeenCalled();
    expect(proposalInsert).toHaveBeenCalled();
    expect(notificationMocks.createOrgNotifications).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        orgId: "org-1",
        userIds: ["admin-owner-1"],
        type: "student.link_request.created",
      })
    );
  });
});
