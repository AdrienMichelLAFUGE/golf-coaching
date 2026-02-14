import { DELETE } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

type Params = { params: { threadId: string } };

describe("DELETE /api/messages/threads/[threadId]", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
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

  it("returns 403 when user is not a member", async () => {
    const admin = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      })),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        admin,
      },
      response: null,
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
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { thread_id: "thread-1", user_id: "user-1" },
                    error: null,
                  }),
                }),
              }),
            }),
            update: updateFn,
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        admin,
      },
      response: null,
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
