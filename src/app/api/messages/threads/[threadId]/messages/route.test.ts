import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  coerceMessageId: jest.fn((value: unknown) => (typeof value === "number" ? value : null)),
  hasCoachContactOptIn: jest.fn(),
  isCoachAllowedForStudent: jest.fn(),
  isCoachLikeRole: jest.fn(),
  isStudentLinkedToStudentId: jest.fn(),
  loadMessageActorContext: jest.fn(),
  loadStudentUserId: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  buildThreadMessagesResponse: jest.fn((threadId: string) => ({ threadId, messages: [] })),
  loadThreadMessages: jest.fn(),
  loadThreadParticipantContext: jest.fn(),
}));

type Params = { params: { threadId: string } };

const buildRequest = (payload?: unknown, url = "https://example.com") =>
  ({
    url,
    json: async () => payload,
  }) as Request;

describe("/api/messages/threads/[threadId]/messages", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    hasCoachContactOptIn: jest.Mock;
    isCoachLikeRole: jest.Mock;
    loadMessageActorContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    loadThreadParticipantContext: jest.Mock;
    loadThreadMessages: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET returns 403 for non participant", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        admin: {},
      },
      response: null,
    });
    serviceMocks.loadThreadParticipantContext.mockResolvedValue(null);

    const response = await GET(buildRequest(undefined, "https://example.com?limit=20"), {
      params: { threadId: "11111111-1111-1111-1111-111111111111" },
    } as Params);

    expect(response.status).toBe(403);
  });

  it("POST denies coach_coach send when opt-in is missing", async () => {
    const admin = {
      from: jest.fn(() => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: "nope" } }),
          }),
        }),
      })),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        admin,
      },
      response: null,
    });
    serviceMocks.loadThreadParticipantContext.mockResolvedValue({
      thread: {
        id: "thread-1",
        kind: "coach_coach",
        participant_a_id: "coach-1",
        participant_b_id: "coach-2",
      },
      ownMember: { thread_id: "thread-1", user_id: "coach-1" },
      counterpartMember: { thread_id: "thread-1", user_id: "coach-2" },
    });
    accessMocks.isCoachLikeRole.mockReturnValue(true);
    accessMocks.hasCoachContactOptIn.mockResolvedValue(false);

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
});
