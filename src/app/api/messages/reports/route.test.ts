import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/moderation", () => ({
  isOrgMessagingAdmin: jest.fn(),
  insertMessageModerationAudit: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  validateThreadAccess: jest.fn(),
}));

jest.mock("@/lib/messages/report-dto", () => ({
  mapMessageReportRowsToDtos: jest.fn(),
}));

describe("messages reports route", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const moderationMocks = jest.requireMock("@/lib/messages/moderation") as {
    isOrgMessagingAdmin: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    validateThreadAccess: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks GET for non-moderation admin", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {},
      response: null,
    });
    moderationMocks.isOrgMessagingAdmin.mockReturnValue(false);

    const response = await GET({} as Request);
    expect(response.status).toBe(403);
  });

  it("returns 422 for invalid POST payload", async () => {
    const response = await POST(
      {
        json: async () => ({ threadId: "invalid" }),
      } as Request
    );

    expect(response.status).toBe(422);
    expect(accessMocks.loadMessageActorContext).not.toHaveBeenCalled();
  });

  it("returns access denial from thread validation", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        activeWorkspace: { id: "22222222-2222-2222-2222-222222222222" },
        profile: { role: "coach" },
        admin: {},
      },
      response: null,
    });
    serviceMocks.validateThreadAccess.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Acces refuse.",
    });

    const response = await POST(
      {
        json: async () => ({
          threadId: "33333333-3333-3333-3333-333333333333",
          reason: "Motif test",
        }),
      } as Request
    );

    expect(response.status).toBe(403);
  });
});
