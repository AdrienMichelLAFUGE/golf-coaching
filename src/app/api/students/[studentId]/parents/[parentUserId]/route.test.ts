import { DELETE } from "./route";

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

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("DELETE /api/students/[studentId]/parents/[parentUserId]", () => {
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

  it("returns 401 when no authenticated user is found", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    });

    const response = await DELETE(buildRequest(), {
      params: { studentId: STUDENT_ID, parentUserId: PARENT_USER_ID },
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when caller cannot access student", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "coach-1" } }, error: null }),
      },
    });
    serverMocks.createSupabaseAdminClient.mockReturnValue({ from: jest.fn(() => ({})) });
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(false);

    const response = await DELETE(buildRequest(), {
      params: { studentId: STUDENT_ID, parentUserId: PARENT_USER_ID },
    });

    expect(response.status).toBe(403);
  });

  it("soft-revokes parent link for authorized coach/admin", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "coach-1" } }, error: null }),
      },
    });
    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_links") return {};
        const chain = {
          eq: () => chain,
          select: () => ({
            maybeSingle: async () => ({ data: { id: "link-1" }, error: null }),
          }),
        };
        return {
          update: () => chain,
        };
      }),
    };
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await DELETE(buildRequest(), {
      params: { studentId: STUDENT_ID, parentUserId: PARENT_USER_ID },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});

