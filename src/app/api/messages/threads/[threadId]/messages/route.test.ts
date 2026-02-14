import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  coerceMessageId: jest.fn((value: unknown) => (typeof value === "number" ? value : null)),
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  buildThreadMessagesResponse: jest.fn((threadId: string) => ({ threadId, messages: [] })),
  loadThreadMembersForThread: jest.fn(async () => []),
  loadThreadMessages: jest.fn(),
  validateThreadAccess: jest.fn(),
}));

jest.mock("@/lib/messages/rate-limit", () => ({
  enforceMessageRateLimit: jest.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
}));

type Params = { params: { threadId: string } };

const buildRequest = (payload?: unknown, url = "https://example.com") =>
  ({
    url,
    json: async () => payload,
  }) as Request;

describe("/api/messages/threads/[threadId]/messages", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    validateThreadAccess: jest.Mock;
  };
  const rateLimitMocks = jest.requireMock("@/lib/messages/rate-limit") as {
    enforceMessageRateLimit: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST returns 429 when rate limit is exceeded", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin: {},
      },
      response: null,
    });
    rateLimitMocks.enforceMessageRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 12,
    });

    const response = await POST(
      buildRequest({ body: "Bonjour" }),
      {
        params: { threadId: "11111111-1111-1111-1111-111111111111" },
      } as Params
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
  });

  it("GET returns 403 for non participant", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
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

    const response = await GET(buildRequest(undefined, "https://example.com?limit=20"), {
      params: { threadId: "11111111-1111-1111-1111-111111111111" },
    } as Params);

    expect(response.status).toBe(403);
  });

  it("POST denies coach_coach send when opt-in is missing", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "personal" },
        admin: {},
      },
      response: null,
    });
    serviceMocks.validateThreadAccess.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Acces refuse: contact coach non autorise.",
    });

    const response = await POST(
      buildRequest({ body: "Bonjour" }),
      {
        params: { threadId: "11111111-1111-1111-1111-111111111111" },
      } as Params
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("contact coach non autorise");
  });

  it("POST denies student send in group_info informational thread", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "student-1",
        profile: { role: "student", full_name: "Eleve" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin: {},
      },
      response: null,
    });
    serviceMocks.validateThreadAccess.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Acces refuse: seuls les coachs assignes peuvent publier.",
    });

    const response = await POST(
      buildRequest({ body: "hello" }),
      {
        params: { threadId: "11111111-1111-1111-1111-111111111111" },
      } as Params
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("coachs assignes");
  });
});
