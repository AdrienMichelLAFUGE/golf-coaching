import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  isCoachLikeRole: jest.fn((role: string) => role !== "student"),
  loadMessageActorContext: jest.fn(),
  loadUserEmailsByIds: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  buildCoachContactRequestDtos: jest.fn(async () => []),
}));

describe("GET /api/messages/contacts", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty contacts for a student without linked accounts", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "student-user-1",
        profile: { role: "student" },
        studentIds: [],
        admin: {},
      },
      response: null,
    });

    const response = await GET({} as Request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      coachContacts: [],
      studentTargets: [],
      groupTargets: [],
      pendingIncomingCoachContactRequests: [],
      pendingOutgoingCoachContactRequests: [],
    });
  });
});
