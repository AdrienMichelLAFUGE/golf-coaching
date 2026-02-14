import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  findAuthUserByEmail: jest.fn(),
  isCoachLikeRole: jest.fn((role: string) => role !== "student"),
  loadMessageActorContext: jest.fn(),
  normalizeUserPair: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  buildCoachContactRequestDtos: jest.fn(async () => []),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/messages/coach-contacts/request", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    findAuthUserByEmail: jest.Mock;
    loadMessageActorContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 409 when requesting contact with self", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        profile: { role: "coach" },
        admin: {},
      },
      response: null,
    });

    accessMocks.findAuthUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
    });

    const response = await POST(buildRequest({ targetEmail: "coach@example.com" }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("propre compte");
  });
});
