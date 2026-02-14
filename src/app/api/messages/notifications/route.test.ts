import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  isCoachLikeRole: jest.fn((role: string) => role !== "student"),
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  buildUnreadPreviews: jest.fn(),
  loadInbox: jest.fn(),
}));

describe("GET /api/messages/notifications", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    buildUnreadPreviews: jest.Mock;
    loadInbox: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("aggregates unread messages and pending contact requests", async () => {
    const admin = {
      from: jest.fn(() => ({
        select: () => ({
          eq: async () => ({ count: 2, error: null }),
        }),
      })),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach" },
        admin,
      },
      response: null,
    });

    serviceMocks.loadInbox.mockResolvedValue({
      unreadMessagesCount: 4,
      threads: [],
    });
    serviceMocks.buildUnreadPreviews.mockReturnValue([
      {
        threadId: "thread-1",
        kind: "coach_coach",
        fromName: "Coach B",
        bodyPreview: "Salut",
        createdAt: "2026-02-13T10:00:00.000Z",
      },
    ]);

    const response = await GET({} as Request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.unreadMessagesCount).toBe(4);
    expect(body.pendingCoachContactRequestsCount).toBe(2);
    expect(body.unreadPreviews).toHaveLength(1);
  });

  it("returns 403 when messaging is blocked for org Free workspace", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: null,
      response: new Response(JSON.stringify({ error: "Lecture seule: plan Free en organisation." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const response = await GET({} as Request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("Lecture seule");
  });
});
