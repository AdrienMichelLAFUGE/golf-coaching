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
    loadUserEmailsByIds: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    buildCoachContactRequestDtos: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    accessMocks.loadUserEmailsByIds.mockImplementation(
      async (_admin: unknown, userIds: string[]) =>
        new Map(userIds.map((userId) => [userId, `${userId}@mail.test`]))
    );
    serviceMocks.buildCoachContactRequestDtos.mockResolvedValue([]);
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

  it("includes same-org coaches as direct contacts without opt-in", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "message_coach_contacts") {
          return {
            select: () => ({
              or: async () => ({ data: [], error: null }),
            }),
          };
        }

        if (table === "message_coach_contact_requests") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }

        if (table === "org_memberships") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [{ user_id: "coach-2" }, { user_id: "coach-1" }],
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "profiles") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "coach-2",
                    role: "coach",
                    full_name: "Coach Two",
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "student_assignments") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }

        if (table === "org_group_coaches") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach One" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin,
      },
      response: null,
    });

    const response = await GET({} as Request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.coachContacts).toEqual([
      {
        userId: "coach-2",
        fullName: "Coach Two",
        email: "coach-2@mail.test",
        role: "coach",
        availability: "same_org",
      },
    ]);
  });
});
