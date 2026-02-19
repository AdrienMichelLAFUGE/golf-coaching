import { loadParentInvitationActor } from "./invitation-access";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/coach-student-access", () => ({
  canCoachLikeAccessStudent: jest.fn(),
}));

describe("loadParentInvitationActor", () => {
  const accessMocks = jest.requireMock("@/lib/parent/coach-student-access") as {
    canCoachLikeAccessStudent: jest.Mock;
  };

  it("allows linked student account", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "student-user-1", role: "student" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { student_id: "student-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      }),
    };

    const result = await loadParentInvitationActor(
      admin as never,
      "student-user-1",
      "student-1"
    );

    expect(result).toEqual({ allowed: true, actorRole: "student" });
  });

  it("allows coach-like actor only when student access check passes", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "profiles") return {};
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "coach-1", role: "coach" },
                error: null,
              }),
            }),
          }),
        };
      }),
    };

    accessMocks.canCoachLikeAccessStudent.mockResolvedValue(true);

    const result = await loadParentInvitationActor(
      admin as never,
      "coach-1",
      "student-1"
    );

    expect(result).toEqual({ allowed: true, actorRole: "coach" });
  });
});
