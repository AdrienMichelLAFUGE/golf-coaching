import {
  coerceMessageId,
  findAuthUserByEmail,
  isCoachAllowedForStudent,
  isCoachLikeRole,
  normalizeUserPair,
} from "./access";

jest.mock("server-only", () => ({}));

const buildSelectMaybeSingle = (result: { data: unknown; error?: { message?: string } | null }) => ({
  select: () => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => result,
    };
    return chain;
  },
});

describe("messages access helpers", () => {
  it("normalizes user pairs lexicographically", () => {
    expect(normalizeUserPair("b-user", "a-user")).toEqual({
      participantAId: "a-user",
      participantBId: "b-user",
    });
  });

  it("coerces message ids from valid numbers and strings", () => {
    expect(coerceMessageId(12)).toBe(12);
    expect(coerceMessageId("34")).toBe(34);
    expect(coerceMessageId("abc")).toBeNull();
    expect(coerceMessageId(0)).toBeNull();
  });

  it("treats only owner/coach/staff as coach-like roles", () => {
    expect(isCoachLikeRole("owner")).toBe(true);
    expect(isCoachLikeRole("coach")).toBe(true);
    expect(isCoachLikeRole("staff")).toBe(true);
    expect(isCoachLikeRole("student")).toBe(false);
    expect(isCoachLikeRole("parent")).toBe(false);
  });

  it("allows a personal workspace owner to message the student", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: {
              id: "student-1",
              org_id: "org-personal",
              first_name: "Alex",
              last_name: null,
            },
            error: null,
          });
        }

        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: {
              workspace_type: "personal",
              owner_profile_id: "coach-owner",
            },
            error: null,
          });
        }

        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    await expect(
      isCoachAllowedForStudent(
        admin as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>,
        "coach-owner",
        "student-1"
      )
    ).resolves.toBe(true);
  });

  it("requires assignment in org workspaces", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: {
              id: "student-1",
              org_id: "org-1",
              first_name: "Alex",
              last_name: null,
            },
            error: null,
          });
        }

        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: {
              workspace_type: "org",
              owner_profile_id: null,
            },
            error: null,
          });
        }

        if (table === "student_assignments") {
          return buildSelectMaybeSingle({
            data: {
              student_id: "student-1",
            },
            error: null,
          });
        }

        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    await expect(
      isCoachAllowedForStudent(
        admin as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>,
        "coach-1",
        "student-1"
      )
    ).resolves.toBe(true);
  });

  it("finds auth users by email across paginated responses", async () => {
    const firstPageUsers = Array.from({ length: 200 }, (_, index) => ({
      id: `u${index + 1}`,
      email: `user${index + 1}@example.com`,
    }));
    const listUsers = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          users: firstPageUsers,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: "u2", email: "target@example.com" }],
        },
        error: null,
      });

    const admin = {
      auth: {
        admin: {
          listUsers,
        },
      },
    };

    await expect(
      findAuthUserByEmail(
        admin as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>,
        "target@example.com"
      )
    ).resolves.toEqual({ id: "u2", email: "target@example.com" });
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});

