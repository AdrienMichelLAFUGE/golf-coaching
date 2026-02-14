import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  coerceMessageId: jest.fn((value: unknown) => (typeof value === "number" ? value : null)),
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  loadThreadParticipantContext: jest.fn(),
}));

type Params = { params: { threadId: string } };

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/messages/threads/[threadId]/read", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    loadThreadParticipantContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("updates read receipt for the calling member only", async () => {
    const secondEqMock = jest.fn().mockResolvedValue({ error: null });
    const firstEqMock = jest.fn().mockReturnValue({ eq: secondEqMock });
    const updateMock = jest.fn().mockReturnValue({ eq: firstEqMock });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "message_messages") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 10 }, error: null }),
                }),
              }),
            }),
          };
        }

        if (table === "message_thread_members") {
          return {
            update: updateMock,
          };
        }

        return {};
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        admin,
      },
      response: null,
    });

    serviceMocks.loadThreadParticipantContext.mockResolvedValue({
      thread: { id: "thread-1" },
      ownMember: { last_read_message_id: 3, last_read_at: "2026-02-13T00:00:00.000Z" },
      counterpartMember: null,
    });

    const response = await POST(
      buildRequest({ lastReadMessageId: 10 }),
      {
        params: { threadId: "11111111-1111-1111-1111-111111111111" },
      } as Params
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(firstEqMock).toHaveBeenCalledWith("thread_id", "11111111-1111-1111-1111-111111111111");
    expect(secondEqMock).toHaveBeenCalledWith("user_id", "user-1");
  });
});
