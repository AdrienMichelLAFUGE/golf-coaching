import { DELETE } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  validateThreadAccess: jest.fn(),
}));

type Params = { params: { threadId: string } };

describe("DELETE /api/messages/threads/[threadId]", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    validateThreadAccess: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 when thread id is invalid", async () => {
    const response = await DELETE({} as Request, {
      params: { threadId: "invalid-thread-id" },
    } as Params);

    expect(response.status).toBe(422);
  });

  it("returns 403 when user cannot access thread", async () => {
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

    const response = await DELETE({} as Request, {
      params: { threadId: "11111111-1111-1111-1111-111111111111" },
    } as Params);

    expect(response.status).toBe(403);
  });

  it("soft deletes thread for current user", async () => {
    const updateFn = jest.fn(() => ({
      eq: () => ({
        eq: async () => ({ error: null }),
      }),
    }));
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "message_thread_members") {
          return {
            update: updateFn,
          };
        }
        return {};
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        profile: { role: "coach" },
        admin,
      },
      response: null,
    });

    serviceMocks.validateThreadAccess.mockResolvedValue({
      ok: true,
      participantContext: {
        thread: { id: "thread-1" },
        ownMember: { thread_id: "thread-1", user_id: "user-1" },
        counterpartMember: null,
      },
      threadMemberUserIds: null,
    });

    const response = await DELETE({} as Request, {
      params: { threadId: "11111111-1111-1111-1111-111111111111" },
    } as Params);

    expect(response.status).toBe(200);
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ hidden_at: expect.any(String) })
    );
  });
});