import { loadThreadMembersForThread } from "./service";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  coerceMessageId: jest.fn(),
  hasCoachContactOptIn: jest.fn(),
  isCoachAllowedForStudent: jest.fn(),
  isCoachLikeActiveOrgMember: jest.fn(),
  isCoachLikeRole: jest.fn((role: string) => role !== "student"),
  loadOrgAudienceUserIds: jest.fn(),
  loadOrgCoachUserIds: jest.fn(),
  loadOrgGroupMemberUserIds: jest.fn(),
  isStudentLinkedToStudentId: jest.fn(),
  isStudentLinkedToOrganization: jest.fn(),
  isUserInOrgGroup: jest.fn(),
  loadStudentUserId: jest.fn(),
  loadUserEmailsByIds: jest.fn(),
}));

describe("messages service - thread members", () => {
  it("falls back to linked student full name when profile.full_name is null", async () => {
    const accessMocks = jest.requireMock("@/lib/messages/access") as {
      loadOrgGroupMemberUserIds: jest.Mock;
    };

    accessMocks.loadOrgGroupMemberUserIds.mockResolvedValue({
      memberUserIds: ["coach-user", "student-user"],
      coachUserIds: ["coach-user"],
      studentUserIds: ["student-user"],
      coachCount: 1,
      studentCount: 1,
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "coach-user",
                    role: "coach",
                    full_name: "Coach A",
                    avatar_url: null,
                  },
                  {
                    id: "student-user",
                    role: "student",
                    full_name: null,
                    avatar_url: null,
                  },
                ],
              }),
            }),
          };
        }

        if (table === "student_accounts") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ user_id: "student-user", student_id: "student-1" }],
              }),
            }),
          };
        }

        if (table === "students") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "student-1",
                    org_id: "org-1",
                    first_name: "Lina",
                    last_name: "Durand",
                  },
                ],
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const members = await loadThreadMembersForThread(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>,
      {
        kind: "group",
        group_id: "group-1",
        workspace_org_id: "org-1",
        participant_a_id: "coach-user",
        participant_b_id: "student-user",
      }
    );

    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "coach-user",
          fullName: "Coach A",
          role: "coach",
        }),
        expect.objectContaining({
          userId: "student-user",
          fullName: "Lina Durand",
          role: "student",
        }),
      ])
    );
  });
});

