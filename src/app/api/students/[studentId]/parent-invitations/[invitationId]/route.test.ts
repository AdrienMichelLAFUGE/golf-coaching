import { DELETE } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/parent/invitation-access", () => ({
  loadParentInvitationActor: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const INVITATION_ID = "22222222-2222-2222-2222-222222222222";

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("DELETE /api/students/[studentId]/parent-invitations/[invitationId]", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const accessMocks = jest.requireMock("@/lib/parent/invitation-access") as {
    loadParentInvitationActor: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "actor-1" } },
          error: null,
        }),
      },
    });
    accessMocks.loadParentInvitationActor.mockResolvedValue({
      allowed: true,
      actorRole: "coach",
    });
  });

  it("revokes pending invitation", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_link_invitations") return {};
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { id: INVITATION_ID },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await DELETE(buildRequest(), {
      params: { studentId: STUDENT_ID, invitationId: INVITATION_ID },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("returns 404 when invitation is missing", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_link_invitations") return {};
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await DELETE(buildRequest(), {
      params: { studentId: STUDENT_ID, invitationId: INVITATION_ID },
    });

    expect(response.status).toBe(404);
  });
});
