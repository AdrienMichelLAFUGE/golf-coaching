import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const THREAD_ID = "22222222-2222-2222-2222-222222222222";
const COACH_ID = "33333333-3333-3333-3333-333333333333";
const STUDENT_USER_ID = "44444444-4444-4444-4444-444444444444";
const PARENT_ID = "55555555-5555-5555-5555-555555555555";

const buildRequest = () =>
  ({
    url: "https://example.com/api/parent/children/" + STUDENT_ID + "/messages/inbox",
    headers: new Headers(),
  }) as Request;

const buildAdminForSuccess = () => ({
  from: jest.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => {
          const chain = {
            eq: (_field: string, value: string) => ({
              maybeSingle: async () => {
                if (value === PARENT_ID) {
                  return { data: { id: PARENT_ID, role: "parent" }, error: null };
                }
                return { data: { id: value, full_name: "Coach Parent" }, error: null };
              },
            }),
            in: async () => ({
              data: [
                { id: COACH_ID, full_name: "Coach Demo" },
                { id: STUDENT_USER_ID, full_name: "Leo Martin" },
              ],
              error: null,
            }),
          };
          return chain;
        },
      };
    }

    if (table === "parent_child_links") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "link-1" }, error: null }),
              }),
            }),
          }),
        }),
      };
    }

    if (table === "students") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: STUDENT_ID, first_name: "Leo", last_name: "Martin" },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "student_accounts") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { user_id: STUDENT_USER_ID }, error: null }),
          }),
        }),
      };
    }

    if (table === "message_threads") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: THREAD_ID,
                    kind: "student_coach",
                    workspace_org_id: "66666666-6666-6666-6666-666666666666",
                    student_id: STUDENT_ID,
                    participant_a_id: STUDENT_USER_ID,
                    participant_b_id: COACH_ID,
                    last_message_id: 10,
                    last_message_at: "2026-02-17T10:00:00.000Z",
                    frozen_at: null,
                    frozen_by: null,
                    frozen_reason: null,
                  },
                  {
                    id: "77777777-7777-7777-7777-777777777777",
                    kind: "group",
                    workspace_org_id: "66666666-6666-6666-6666-666666666666",
                    student_id: STUDENT_ID,
                    participant_a_id: STUDENT_USER_ID,
                    participant_b_id: COACH_ID,
                    last_message_id: null,
                    last_message_at: null,
                    frozen_at: null,
                    frozen_by: null,
                    frozen_reason: null,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    if (table === "message_messages") {
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: 10, sender_user_id: COACH_ID, body: "Rendez-vous demain." }],
            error: null,
          }),
        }),
      };
    }

    if (table === "message_thread_members") {
      return {
        select: () => ({
          in: async () => ({
            data: [
              {
                thread_id: THREAD_ID,
                user_id: COACH_ID,
                last_read_message_id: 10,
                last_read_at: "2026-02-17T10:05:00.000Z",
              },
            ],
            error: null,
          }),
        }),
      };
    }

    return {
      select: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    };
  }),
});

describe("GET /api/parent/children/[id]/messages/inbox", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 without auth", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-parent profiles", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: COACH_ID } }, error: null }),
      },
    });
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table !== "profiles") return {};
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: COACH_ID, role: "coach" },
                error: null,
              }),
            }),
          }),
        };
      }),
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(403);
  });

  it("returns 403 when parent is not linked to the child", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: PARENT_ID, email: "parent@example.com" } },
          error: null,
        }),
      },
    });
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: PARENT_ID, role: "parent" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "parent_child_links") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      }),
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(403);
  });

  it("returns 200 for linked parent and excludes non student_coach threads", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: PARENT_ID, email: "parent@example.com" } },
          error: null,
        }),
      },
    });
    serverMocks.createSupabaseAdminClient.mockReturnValue(buildAdminForSuccess());

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].kind).toBe("student_coach");
    expect(body.threads[0].threadId).toBe(THREAD_ID);
  });
});
