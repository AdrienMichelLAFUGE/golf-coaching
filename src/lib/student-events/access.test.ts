import { resolveStudentEventAccess } from "./access";

jest.mock("server-only", () => ({}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

const buildSelectMaybeSingle = (result: QueryResult) => {
  const chain = {
    eq: () => chain,
    contains: () => chain,
    ilike: () => chain,
    maybeSingle: async () => result,
  };

  return {
    select: () => chain,
  };
};

const buildAdmin = (results: Partial<Record<string, QueryResult>>) => ({
  from: jest.fn((table: string) => {
    const result = results[table] ?? { data: null, error: null };
    return buildSelectMaybeSingle(result);
  }),
});

describe("resolveStudentEventAccess", () => {
  it("grants read/write when the user is linked student", async () => {
    const admin = buildAdmin({
      student_accounts: { data: { id: "account-1" }, error: null },
    });

    const access = await resolveStudentEventAccess(
      admin as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createSupabaseAdminClient
      >,
      "user-1",
      "11111111-1111-1111-1111-111111111111"
    );

    expect(access).toEqual({
      canRead: true,
      canWrite: true,
      reason: "student",
    });
    expect(admin.from).toHaveBeenCalledWith("student_accounts");
  });

  it("grants coach read/write in personal workspace when owner", async () => {
    const admin = buildAdmin({
      student_accounts: { data: null, error: null },
      students: {
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          org_id: "org-personal",
        },
        error: null,
      },
      profiles: {
        data: {
          id: "coach-1",
          org_id: "org-personal",
          active_workspace_id: "org-personal",
        },
        error: null,
      },
      organizations: {
        data: {
          id: "org-personal",
          workspace_type: "personal",
          owner_profile_id: "coach-1",
        },
        error: null,
      },
    });

    const access = await resolveStudentEventAccess(
      admin as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createSupabaseAdminClient
      >,
      "coach-1",
      "11111111-1111-1111-1111-111111111111"
    );

    expect(access).toEqual({
      canRead: true,
      canWrite: true,
      reason: "coach_linked",
    });
  });

  it("grants coach read/write in org workspace when assigned and active", async () => {
    const admin = buildAdmin({
      student_accounts: { data: null, error: null },
      students: {
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          org_id: "org-1",
        },
        error: null,
      },
      profiles: {
        data: {
          id: "coach-1",
          org_id: "org-1",
          active_workspace_id: "org-1",
        },
        error: null,
      },
      organizations: {
        data: {
          id: "org-1",
          workspace_type: "org",
          owner_profile_id: null,
        },
        error: null,
      },
      org_memberships: {
        data: { status: "active" },
        error: null,
      },
      student_assignments: {
        data: {
          student_id: "11111111-1111-1111-1111-111111111111",
        },
        error: null,
      },
    });

    const access = await resolveStudentEventAccess(
      admin as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createSupabaseAdminClient
      >,
      "coach-1",
      "11111111-1111-1111-1111-111111111111"
    );

    expect(access).toEqual({
      canRead: true,
      canWrite: true,
      reason: "coach_linked",
    });
  });

  it("grants coach read-only when student share is active", async () => {
    const admin = buildAdmin({
      student_accounts: { data: null, error: null },
      student_shares: {
        data: { id: "share-1" },
        error: null,
      },
    });

    const access = await resolveStudentEventAccess(
      admin as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createSupabaseAdminClient
      >,
      "coach-1",
      "11111111-1111-1111-1111-111111111111",
      "coach@example.com"
    );

    expect(access).toEqual({
      canRead: true,
      canWrite: false,
      reason: "coach_linked",
    });
  });

  it("grants parent read-only when linked to student", async () => {
    const admin = buildAdmin({
      student_accounts: { data: null, error: null },
      parent_child_links: { data: { id: "link-1" }, error: null },
    });

    const access = await resolveStudentEventAccess(
      admin as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createSupabaseAdminClient
      >,
      "parent-1",
      "11111111-1111-1111-1111-111111111111",
      "parent@example.com"
    );

    expect(access).toEqual({
      canRead: true,
      canWrite: false,
      reason: "parent_linked",
    });
  });

  it("denies org coach read access when not assigned", async () => {
    const admin = buildAdmin({
      student_accounts: { data: null, error: null },
      students: {
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          org_id: "org-1",
        },
        error: null,
      },
      profiles: {
        data: {
          id: "coach-1",
          org_id: "org-1",
          active_workspace_id: "org-1",
        },
        error: null,
      },
      organizations: {
        data: {
          id: "org-1",
          workspace_type: "org",
          owner_profile_id: null,
        },
        error: null,
      },
      org_memberships: {
        data: { status: "active" },
        error: null,
      },
      student_assignments: {
        data: null,
        error: null,
      },
    });

    const access = await resolveStudentEventAccess(
      admin as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createSupabaseAdminClient
      >,
      "coach-1",
      "11111111-1111-1111-1111-111111111111"
    );

    expect(access).toEqual({
      canRead: false,
      canWrite: false,
      reason: "forbidden",
    });
  });
});
