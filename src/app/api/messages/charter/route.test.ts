import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/charter", () => ({
  loadMessagingCharterStatus: jest.fn(),
  acceptMessagingCharter: jest.fn(),
}));

describe("messages charter route", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const charterMocks = jest.requireMock("@/lib/messages/charter") as {
    loadMessagingCharterStatus: jest.Mock;
    acceptMessagingCharter: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns charter status on GET", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        activeWorkspace: { id: "22222222-2222-2222-2222-222222222222" },
        admin: {},
      },
      response: null,
    });
    charterMocks.loadMessagingCharterStatus.mockResolvedValue({
      charterVersion: 2,
      mustAccept: true,
      acceptedAt: null,
      content: {
        title: "Charte",
        body: "Texte",
        orgNamePlaceholder: "{ORG_NAME}",
        supportEmailPlaceholder: "{DPO_OR_SUPPORT_EMAIL}",
      },
    });

    const response = await GET({} as Request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.charterVersion).toBe(2);
    expect(body.mustAccept).toBe(true);
  });

  it("returns 409 on stale charter version in POST", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        activeWorkspace: { id: "22222222-2222-2222-2222-222222222222" },
        admin: {},
      },
      response: null,
    });
    charterMocks.loadMessagingCharterStatus.mockResolvedValue({
      charterVersion: 3,
      mustAccept: true,
      acceptedAt: null,
      content: {
        title: "Charte",
        body: "Texte",
        orgNamePlaceholder: "{ORG_NAME}",
        supportEmailPlaceholder: "{DPO_OR_SUPPORT_EMAIL}",
      },
    });

    const response = await POST(
      {
        json: async () => ({ charterVersion: 2 }),
      } as Request
    );

    expect(response.status).toBe(409);
  });
});
