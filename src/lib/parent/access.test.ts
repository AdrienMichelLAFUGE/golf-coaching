import {
  hasParentChildLink,
  isParentRole,
  loadParentLinkedStudentIds,
  loadParentLinkedStudentContext,
} from "./access";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

const buildSelectMaybeSingle = (result: QueryResult) => {
  const chain = {
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return {
    select: () => chain,
  };
};

describe("parent access helpers", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("recognizes parent role explicitly", () => {
    expect(isParentRole("parent")).toBe(true);
    expect(isParentRole("coach")).toBe(false);
    expect(isParentRole(null)).toBe(false);
  });

  it("returns linked context for parent linked to child", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "parent-1", email: "parent@example.com" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "parent-1", role: "parent", full_name: "Parent One" },
            error: null,
          });
        }
        if (table === "parent_child_links") {
          return buildSelectMaybeSingle({
            data: { id: "link-1" },
            error: null,
          });
        }
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: {
              id: "student-1",
              org_id: "org-1",
              first_name: "Leo",
              last_name: "Martin",
              email: "leo@example.com",
            },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const result = await loadParentLinkedStudentContext(
      {} as Request,
      "student-1"
    );

    expect(result.failure).toBeNull();
    expect(result.context?.studentId).toBe("student-1");
    expect(result.context?.studentFirstName).toBe("Leo");
    expect(result.context?.parentUserId).toBe("parent-1");
  });

  it("denies access when parent is not linked to child", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "parent-2", email: "parent2@example.com" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "parent-2", role: "parent", full_name: "Parent Two" },
            error: null,
          });
        }
        if (table === "parent_child_links") {
          return buildSelectMaybeSingle({ data: null, error: null });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const result = await loadParentLinkedStudentContext(
      {} as Request,
      "student-1"
    );

    expect(result.context).toBeNull();
    expect(result.failure).toEqual({ status: 403, error: "Acces refuse." });
  });

  it("returns false for hasParentChildLink when lookup misses", async () => {
    const admin = {
      from: jest.fn(() =>
        buildSelectMaybeSingle({
          data: null,
          error: null,
        })
      ),
    } as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

    const linked = await hasParentChildLink(admin, "parent-1", "student-1");
    expect(linked).toBe(false);
  });

  it("loads sibling student ids for the same linked student account", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "student_accounts") {
          return buildSelectMaybeSingle({ data: null, error: null });
        }

        return {
          select: () => ({
            eq: (field: string, value: string) => {
              if (field === "student_id") {
                return {
                  maybeSingle: async () =>
                    value === "student-1"
                      ? { data: { user_id: "student-user-1" }, error: null }
                      : { data: null, error: null },
                };
              }

              if (field === "user_id") {
                return Promise.resolve({
                  data: [
                    { student_id: "student-1" },
                    { student_id: "student-2" },
                  ],
                  error: null,
                });
              }

              return Promise.resolve({ data: [], error: null });
            },
          }),
        };
      }),
    } as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

    const ids = await loadParentLinkedStudentIds(admin, "student-1");
    expect(ids).toEqual(["student-1", "student-2"]);
  });

  it("falls back to the requested id when student account lookup fails", async () => {
    const admin = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      })),
    } as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

    const ids = await loadParentLinkedStudentIds(admin, "student-1");
    expect(ids).toEqual(["student-1"]);
  });
});
