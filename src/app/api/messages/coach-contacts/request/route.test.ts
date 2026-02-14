import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  findAuthUserByEmail: jest.fn(),
  isCoachLikeActiveOrgMember: jest.fn(),
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
    isCoachLikeActiveOrgMember: jest.Mock;
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
        activeWorkspace: { id: "org-1", workspace_type: "org" },
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

  it("returns 409 when target coach is already in the same organization", async () => {
    const admin = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "user-2", role: "coach" },
              error: null,
            }),
          }),
        }),
      })),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "user-1",
        profile: { role: "coach" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin,
      },
      response: null,
    });
    accessMocks.findAuthUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "coach2@example.com",
    });
    accessMocks.isCoachLikeActiveOrgMember.mockResolvedValue(true);

    const response = await POST(buildRequest({ targetEmail: "coach2@example.com" }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("deja disponible");
  });
});
