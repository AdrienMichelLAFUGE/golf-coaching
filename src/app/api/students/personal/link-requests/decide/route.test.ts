import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/activity-log", () => ({
  recordActivity: jest.fn(async () => {}),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/students/personal/link-requests/decide", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("accepts request with share decision", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "owner-1" } },
          error: null,
        }),
      },
    });

    const shareUpsert = jest.fn(async () => ({ error: null }));
    const requestUpdate = jest.fn(() => ({
      eq: () => ({
        eq: async () => ({ error: null }),
      }),
    }));

    const admin = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "owner-1",
                    org_id: "org-owner",
                    active_workspace_id: "org-owner",
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "organizations") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "org-owner",
                    workspace_type: "personal",
                    owner_profile_id: "owner-1",
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "personal_student_link_requests") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "req-1",
                    source_student_id: "student-1",
                    source_org_id: "org-owner",
                    source_owner_user_id: "owner-1",
                    requester_org_id: "org-requester",
                    requester_user_id: "coach-2",
                    requester_email: "coach2@example.com",
                    student_email: "camille@example.com",
                    status: "pending",
                  },
                  error: null,
                }),
              }),
            }),
            update: requestUpdate,
          };
        }
        if (table === "students") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "student-1", email: "camille@example.com" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "student_shares") {
          return {
            upsert: shareUpsert,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        requestId: "11111111-1111-1111-1111-111111111111",
        decision: "share",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("accepted_share");
    expect(shareUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          student_id: "student-1",
          owner_id: "owner-1",
          viewer_email: "coach2@example.com",
          status: "active",
        }),
      ],
      { onConflict: "student_id,viewer_email" }
    );
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("returns 403 when current user is not request owner", async () => {
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "owner-1" } },
          error: null,
        }),
      },
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "owner-1",
                    org_id: "org-owner",
                    active_workspace_id: "org-owner",
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "organizations") {
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "org-owner",
                    workspace_type: "personal",
                    owner_profile_id: "owner-1",
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "personal_student_link_requests") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "req-1",
                    source_student_id: "student-1",
                    source_org_id: "org-owner",
                    source_owner_user_id: "another-owner",
                    requester_org_id: "org-requester",
                    requester_user_id: "coach-2",
                    requester_email: "coach2@example.com",
                    student_email: "camille@example.com",
                    status: "pending",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        requestId: "11111111-1111-1111-1111-111111111111",
        decision: "share",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
  });
});
