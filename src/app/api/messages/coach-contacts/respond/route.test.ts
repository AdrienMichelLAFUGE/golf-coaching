import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  isCoachLikeRole: jest.fn((role: string) => role !== "student"),
  loadMessageActorContext: jest.fn(),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/messages/coach-contacts/respond", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when current user is not the request target", async () => {
    const admin = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "request-1",
                requester_user_id: "coach-1",
                target_user_id: "coach-2",
                pair_user_a_id: "coach-1",
                pair_user_b_id: "coach-2",
              },
              error: null,
            }),
          }),
        }),
      })),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-3",
        profile: { role: "coach" },
        admin,
      },
      response: null,
    });

    const response = await POST(
      buildRequest({
        requestId: "11111111-1111-1111-1111-111111111111",
        decision: "accept",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
  });
});
