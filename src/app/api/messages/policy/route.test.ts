import { GET, PATCH } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/policy", () => ({
  loadMessagingPolicy: jest.fn(),
  updateMessagingPolicy: jest.fn(),
}));

describe("messages policy route", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const policyMocks = jest.requireMock("@/lib/messages/policy") as {
    loadMessagingPolicy: jest.Mock;
    updateMessagingPolicy: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks GET for non-admin in org workspace", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        orgMembershipRole: "coach",
        activeWorkspace: {
          id: "22222222-2222-2222-2222-222222222222",
          workspace_type: "org",
          owner_profile_id: null,
        },
        admin: {},
      },
      response: null,
    });

    const response = await GET({} as Request);
    expect(response.status).toBe(403);
  });

  it("updates policy on PATCH for org admin", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        orgMembershipRole: "admin",
        activeWorkspace: {
          id: "22222222-2222-2222-2222-222222222222",
          workspace_type: "org",
          owner_profile_id: null,
        },
        admin: {},
      },
      response: null,
    });

    policyMocks.updateMessagingPolicy.mockResolvedValue({ error: null });
    policyMocks.loadMessagingPolicy.mockResolvedValue({
      orgId: "22222222-2222-2222-2222-222222222222",
      guardMode: "block",
      sensitiveWords: ["whatsapp"],
      retentionDays: 180,
      charterVersion: 2,
      supervisionEnabled: true,
    });

    const response = await PATCH(
      {
        json: async () => ({ guardMode: "block", retentionDays: 180 }),
      } as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.guardMode).toBe("block");
    expect(body.retentionDays).toBe(180);
  });
});
