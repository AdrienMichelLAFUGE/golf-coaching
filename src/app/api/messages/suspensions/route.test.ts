import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/moderation", () => ({
  isOrgMessagingAdmin: jest.fn(),
}));

jest.mock("@/lib/messages/suspensions", () => ({
  listActiveMessagingSuspensions: jest.fn(),
}));

describe("messages suspensions route", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const moderationMocks = jest.requireMock("@/lib/messages/moderation") as {
    isOrgMessagingAdmin: jest.Mock;
  };
  const suspensionMocks = jest.requireMock("@/lib/messages/suspensions") as {
    listActiveMessagingSuspensions: jest.Mock;
  };

  const buildAdmin = () => ({
    from: jest.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "33333333-3333-3333-3333-333333333333", role: "student" },
              }),
            }),
          }),
        };
      }
      if (table === "student_accounts") {
        return {
          select: () => ({
            eq: () => ({
              data: [{ student_id: "student-1" }],
            }),
          }),
        };
      }
      if (table === "students") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              in: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: { id: "student-1" } }),
            };
            return chain;
          },
        };
      }
      if (table === "message_user_suspensions") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              is: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: null }),
            };
            return chain;
          },
          insert: async () => ({ error: null }),
          update: () => {
            const chain = {
              eq: () => chain,
              is: async () => ({ error: null }),
            };
            return chain;
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      };
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks GET for non-org-admin", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {},
      response: null,
    });
    moderationMocks.isOrgMessagingAdmin.mockReturnValue(false);

    const response = await GET({} as Request);
    expect(response.status).toBe(403);
  });

  it("creates suspension for org admin", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        admin: buildAdmin(),
        activeWorkspace: { id: "22222222-2222-2222-2222-222222222222" },
      },
      response: null,
    });
    moderationMocks.isOrgMessagingAdmin.mockReturnValue(true);
    suspensionMocks.listActiveMessagingSuspensions.mockResolvedValue([
      {
        id: "55555555-5555-5555-5555-555555555555",
        orgId: "22222222-2222-2222-2222-222222222222",
        userId: "33333333-3333-3333-3333-333333333333",
        userName: "Eleve",
        userRole: "student",
        reason: "Test",
        suspendedUntil: null,
        createdAt: "2026-01-01T10:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        createdByName: "Admin",
      },
    ]);

    const response = await POST(
      {
        json: async () => ({
          action: "suspend",
          userId: "33333333-3333-3333-3333-333333333333",
          reason: "Comportement inapproprie",
        }),
      } as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.suspensions)).toBe(true);
    expect(body.suspensions).toHaveLength(1);
  });
});
