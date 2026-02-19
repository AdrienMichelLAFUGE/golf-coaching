import { PATCH } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/parent/coach-student-access", () => ({
  canCoachLikeAccessStudent: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const PARENT_USER_ID = "22222222-2222-2222-2222-222222222222";

const buildRequest = (payload: unknown) =>
  ({
    headers: new Headers(),
    json: async () => payload,
  }) as Request;

describe("PATCH /api/students/[studentId]/parents/[parentUserId]/permissions", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const accessMocks = jest.requireMock("@/lib/parent/coach-student-access") as {
    canCoachLikeAccessStudent: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await PATCH(buildRequest({ permissions: {} }), {
      params: { studentId: STUDENT_ID, parentUserId: PARENT_USER_ID },
    });
    expect(response.status).toBe(422);
  });

  it("updates parent permissions for authorized coach/admin", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "coach-1" } }, error: null }),
      },
    });
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const updateEq = jest.fn(async () => ({ error: null }));
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_links") return {};
        const selectChain = {
          eq: () => selectChain,
          maybeSingle: async () => ({
            data: {
              id: "link-1",
              permissions: {
                dashboard: true,
                rapports: true,
                tests: true,
                calendrier: true,
                messages: true,
              },
            },
            error: null,
          }),
        };
        return {
          select: () => selectChain,
          update: () => ({
            eq: updateEq,
          }),
        };
      }),
    };
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({ permissions: { messages: false } }),
      {
        params: { studentId: STUDENT_ID, parentUserId: PARENT_USER_ID },
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions).toEqual({
      dashboard: true,
      rapports: true,
      tests: true,
      calendrier: true,
      messages: false,
    });
    expect(updateEq).toHaveBeenCalledWith("id", "link-1");
  });
});

