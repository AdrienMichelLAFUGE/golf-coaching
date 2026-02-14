import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  hasCoachContactOptIn: jest.fn(),
  isCoachLikeActiveOrgMember: jest.fn(),
  isCoachAllowedForStudent: jest.fn(),
  isCoachLikeRole: jest.fn(),
  isStudentLinkedToStudentId: jest.fn(),
  loadOrgAudienceUserIds: jest.fn(),
  loadOrgCoachUserIds: jest.fn(),
  loadOrgGroupMemberUserIds: jest.fn(),
  loadOrgGroupRow: jest.fn(),
  loadMessageActorContext: jest.fn(),
  loadStudentRow: jest.fn(),
  loadStudentUserId: jest.fn(),
  normalizeUserPair: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => result,
    };
    return chain;
  },
});

describe("POST /api/messages/threads", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    hasCoachContactOptIn: jest.Mock;
    isCoachLikeActiveOrgMember: jest.Mock;
    isCoachAllowedForStudent: jest.Mock;
    isCoachLikeRole: jest.Mock;
    isStudentLinkedToStudentId: jest.Mock;
    loadOrgAudienceUserIds: jest.Mock;
    loadOrgCoachUserIds: jest.Mock;
    loadOrgGroupMemberUserIds: jest.Mock;
    loadOrgGroupRow: jest.Mock;
    loadMessageActorContext: jest.Mock;
    loadStudentRow: jest.Mock;
    loadStudentUserId: jest.Mock;
    normalizeUserPair: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(422);
    expect(accessMocks.loadMessageActorContext).not.toHaveBeenCalled();
  });

  it("blocks student_coach creation when coach is not assigned", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "coach-1", role: "coach" },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "student-user-1",
        profile: { role: "student", full_name: "Student" },
        activeWorkspace: { id: "org-1" },
        admin,
      },
      response: null,
    });
    accessMocks.isCoachLikeRole.mockReturnValue(true);
    accessMocks.loadStudentRow.mockResolvedValue({ id: "student-1", org_id: "org-1" });
    accessMocks.loadStudentUserId.mockResolvedValue("student-user-1");
    accessMocks.normalizeUserPair.mockReturnValue({
      participantAId: "coach-1",
      participantBId: "student-user-1",
    });
    accessMocks.isStudentLinkedToStudentId.mockResolvedValue(true);
    accessMocks.isCoachAllowedForStudent.mockResolvedValue(false);

    const response = await POST(
      buildRequest({
        kind: "student_coach",
        studentId: "11111111-1111-1111-1111-111111111111",
        coachId: "22222222-2222-2222-2222-222222222222",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("coach non assigne");
  });

  it("returns existing coach_coach thread idempotently", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "coach-2", role: "coach" },
            error: null,
          });
        }
        if (table === "message_threads") {
          return buildSelectMaybeSingle({
            data: { id: "thread-existing" },
            error: null,
          });
        }
        if (table === "message_thread_members") {
          return {
            upsert: async () => ({ error: null }),
            update: () => ({
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            }),
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "personal" },
        admin,
      },
      response: null,
    });
    accessMocks.isCoachLikeRole.mockReturnValue(true);
    accessMocks.hasCoachContactOptIn.mockResolvedValue(true);
    accessMocks.normalizeUserPair.mockReturnValue({
      participantAId: "coach-1",
      participantBId: "coach-2",
    });

    const response = await POST(
      buildRequest({
        kind: "coach_coach",
        coachUserId: "22222222-2222-2222-2222-222222222222",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.threadId).toBe("thread-existing");
    expect(body.created).toBe(false);
  });

  it("allows coach_coach thread for active members in the same organization without opt-in", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "coach-2", role: "coach" },
            error: null,
          });
        }
        if (table === "message_threads") {
          return buildSelectMaybeSingle({
            data: { id: "thread-same-org" },
            error: null,
          });
        }
        if (table === "message_thread_members") {
          return {
            upsert: async () => ({ error: null }),
            update: () => ({
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            }),
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin,
      },
      response: null,
    });
    accessMocks.isCoachLikeRole.mockReturnValue(true);
    accessMocks.isCoachLikeActiveOrgMember.mockResolvedValue(true);
    accessMocks.normalizeUserPair.mockReturnValue({
      participantAId: "coach-1",
      participantBId: "coach-2",
    });

    const response = await POST(
      buildRequest({
        kind: "coach_coach",
        coachUserId: "22222222-2222-2222-2222-222222222222",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.threadId).toBe("thread-same-org");
    expect(body.created).toBe(false);
    expect(accessMocks.hasCoachContactOptIn).not.toHaveBeenCalled();
  });

  it("keeps opt-in required when target coach is not in the same organization", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "coach-2", role: "coach" },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin,
      },
      response: null,
    });
    accessMocks.isCoachLikeRole.mockReturnValue(true);
    accessMocks.isCoachLikeActiveOrgMember.mockResolvedValue(false);
    accessMocks.hasCoachContactOptIn.mockResolvedValue(false);

    const response = await POST(
      buildRequest({
        kind: "coach_coach",
        coachUserId: "22222222-2222-2222-2222-222222222222",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("contact coach non autorise");
  });

  it("rejects group thread creation outside organization workspaces", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-personal", workspace_type: "personal" },
        admin: {},
      },
      response: null,
    });

    const response = await POST(
      buildRequest({
        kind: "group",
        groupId: "22222222-2222-2222-2222-222222222222",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("reservee aux structures");
  });

  it("allows org_info thread creation idempotently in organization workspace", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "message_threads") {
          return buildSelectMaybeSingle({
            data: { id: "thread-org-info" },
            error: null,
          });
        }
        if (table === "message_thread_members") {
          return {
            upsert: async () => ({ error: null }),
            update: () => ({
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            }),
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin,
      },
      response: null,
    });
    accessMocks.isCoachLikeRole.mockReturnValue(true);
    accessMocks.loadOrgAudienceUserIds.mockResolvedValue({
      coachUserIds: ["coach-1", "coach-2"],
      studentUserIds: ["student-1"],
      memberUserIds: ["coach-1", "coach-2", "student-1"],
    });

    const response = await POST(
      buildRequest({
        kind: "org_info",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.threadId).toBe("thread-org-info");
    expect(body.created).toBe(false);
  });

  it("rejects group_info publish for coach not assigned to the group", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "coach-1",
        profile: { role: "coach", full_name: "Coach" },
        activeWorkspace: { id: "org-1", workspace_type: "org" },
        admin: {},
      },
      response: null,
    });
    accessMocks.loadOrgGroupRow.mockResolvedValue({
      id: "group-1",
      org_id: "org-1",
      name: "Groupe A",
    });
    accessMocks.loadOrgGroupMemberUserIds.mockResolvedValue({
      memberUserIds: ["coach-1", "student-1"],
      coachUserIds: ["coach-2"],
      studentUserIds: ["student-1"],
      coachCount: 1,
      studentCount: 1,
    });

    const response = await POST(
      buildRequest({
        kind: "group_info",
        groupId: "22222222-2222-2222-2222-222222222222",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("seuls les coachs assignes");
  });
});
