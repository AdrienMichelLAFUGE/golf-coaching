import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: {
        user: {
          id: string;
          email?: string;
          user_metadata?: Record<string, unknown>;
        } | null;
      };
      error: unknown | null;
    }>;
  };
};

const buildRequest = (headers?: Record<string, string>) =>
  ({
    headers: {
      get: (key: string) => {
        const lower = key.toLowerCase();
        return headers?.[lower] ?? headers?.[key] ?? null;
      },
    },
  }) as Request;

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => result,
    }),
    ilike: () => ({
      maybeSingle: async () => result,
      order: async () => result,
    }),
  }),
});

const buildSelectList = (result: QueryResult) => ({
  select: () => ({
    ilike: () => ({
      order: async () => result,
    }),
  }),
});

describe("POST /api/onboarding/ensure-profile", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when user is not authenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 403 when role hint is invalid", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "user-1",
              email: "user@example.com",
              user_metadata: { role: "student" },
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const orgInsert = jest.fn();
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({ data: null, error: null });
        }
        if (table === "students") {
          return buildSelectList({ data: [], error: null });
        }
        if (table === "organizations") {
          return { insert: orgInsert };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces reserve aux comptes invites.");
    expect(admin.from).not.toHaveBeenCalledWith("organizations");
  });

  it("creates personal workspace without org for new coach", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "coach-1",
              email: "coach@example.com",
              user_metadata: { role: "coach", full_name: "Coach Test" },
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileSelect = jest.fn(() => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }));
    const profileUpsert = jest.fn(async () => ({ error: null }));
    const profileUpdateEq = jest.fn(async () => ({ error: null }));
    const profileUpdate = jest.fn(() => ({ eq: profileUpdateEq }));

    const orgSelect = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      in: async () => ({ data: [], error: null }),
    }));
    const insertedOrganizations: unknown[] = [];
    const orgInsert = jest.fn((payload: unknown) => {
      insertedOrganizations.push(payload);
      return {
        select: () => ({
          single: async () => ({ data: { id: "personal-1" }, error: null }),
        }),
      };
    });

    const orgMembershipInsert = jest.fn(async () => ({ error: null }));
    const orgMembershipSelect = jest.fn(() => ({
      eq: async () => ({ data: [], error: null }),
    }));
    const orgMembershipDelete = jest.fn(() => ({
      eq: () => ({
        in: async () => ({ data: null, error: null }),
      }),
    }));
    const reportSharesSelect = jest.fn(() => ({
      eq: () => ({
        in: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }));
    const reportSharesUpdate = jest.fn(() => ({
      in: async () => ({ error: null }),
    }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
            upsert: profileUpsert,
            update: profileUpdate,
          };
        }
        if (table === "students") {
          return buildSelectList({ data: [], error: null });
        }
        if (table === "organizations") {
          return { select: orgSelect, insert: orgInsert };
        }
        if (table === "org_memberships") {
          return {
            insert: orgMembershipInsert,
            select: orgMembershipSelect,
            delete: orgMembershipDelete,
          };
        }
        if (table === "report_shares") {
          return {
            select: reportSharesSelect,
            update: reportSharesUpdate,
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe("coach");
    expect(profileUpsert).toHaveBeenCalledWith(
      {
        id: "coach-1",
        role: "coach",
        full_name: "Coach Test",
      },
      { onConflict: "id" }
    );
    expect(profileUpdate).toHaveBeenCalledWith({
      org_id: "personal-1",
      active_workspace_id: "personal-1",
    });
    expect(profileUpdateEq).toHaveBeenCalledWith("id", "coach-1");
    expect(orgInsert).toHaveBeenCalledTimes(1);
    const inserted = insertedOrganizations[0] as Array<{
      workspace_type?: string;
      name?: string;
    }>;
    expect(inserted[0]?.workspace_type).toBe("personal");
    expect(inserted[0]?.name).not.toBe("Nouvelle organisation");
    expect(orgMembershipInsert).toHaveBeenCalledWith([
      {
        org_id: "personal-1",
        user_id: "coach-1",
        role: "admin",
        status: "active",
        premium_active: true,
      },
    ]);
    expect(reportSharesSelect).toHaveBeenCalled();
  });

  it("creates parent profile and personal workspace when role hint is parent", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "parent-1",
              email: "parent@example.com",
              user_metadata: { role: "parent", full_name: "Parent Test" },
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileSelect = jest.fn(() => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }));
    const profileUpsert = jest.fn(async () => ({ error: null }));
    const profileUpdateEq = jest.fn(async () => ({ error: null }));
    const profileUpdate = jest.fn(() => ({ eq: profileUpdateEq }));

    const orgSelect = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      in: async () => ({ data: [], error: null }),
    }));
    const orgInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "personal-parent-1" }, error: null }),
      }),
    }));

    const orgMembershipInsert = jest.fn(async () => ({ error: null }));
    const appActivityInsert = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
            upsert: profileUpsert,
            update: profileUpdate,
          };
        }
        if (table === "students") {
          return buildSelectList({ data: [], error: null });
        }
        if (table === "organizations") {
          return { select: orgSelect, insert: orgInsert };
        }
        if (table === "org_memberships") {
          return {
            insert: orgMembershipInsert,
          };
        }
        if (table === "app_activity_logs") {
          return {
            insert: appActivityInsert,
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe("parent");
    expect(profileUpsert).toHaveBeenCalledWith(
      {
        id: "parent-1",
        role: "parent",
        full_name: "Parent Test",
      },
      { onConflict: "id" }
    );
    expect(profileUpdate).toHaveBeenCalledWith({
      org_id: "personal-parent-1",
      active_workspace_id: "personal-parent-1",
    });
    expect(orgMembershipInsert).toHaveBeenCalledWith([
      {
        org_id: "personal-parent-1",
        user_id: "parent-1",
        role: "admin",
        status: "active",
        premium_active: true,
      },
    ]);
  });

  it("reconciles existing legacy parent account stamped as coach", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "parent-legacy-1",
              email: "parent.legacy@example.com",
              user_metadata: { role: "parent", full_name: "Parent Legacy" },
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileSelect = jest.fn(() => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: "parent-legacy-1",
            role: "coach",
            org_id: "personal-parent-legacy-1",
            full_name: "Parent Legacy",
            active_workspace_id: "personal-parent-legacy-1",
          },
          error: null,
        }),
      }),
    }));
    const profileUpdateEq = jest.fn(async () => ({ error: null }));
    const profileUpdate = jest.fn(() => ({ eq: profileUpdateEq }));

    const orgSelect = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "personal-parent-legacy-1" },
            error: null,
          }),
        }),
      }),
    }));

    const appActivityInsert = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
            update: profileUpdate,
          };
        }
        if (table === "organizations") {
          return { select: orgSelect };
        }
        if (table === "app_activity_logs") {
          return { insert: appActivityInsert };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe("parent");
    expect(profileUpdate).toHaveBeenCalledWith({ role: "parent" });
    expect(profileUpdateEq).toHaveBeenCalledWith("id", "parent-legacy-1");
  });

  it("claims emailed report shares as in-app pending notifications for new coach", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "coach-2",
              email: "coach2@example.com",
              user_metadata: { role: "coach", full_name: "Coach Deux" },
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileSelect = jest.fn(() => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }));
    const profileUpsert = jest.fn(async () => ({ error: null }));
    const profileUpdateEq = jest.fn(async () => ({ error: null }));
    const profileUpdate = jest.fn(() => ({ eq: profileUpdateEq }));

    const orgSelect = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      in: async () => ({ data: [], error: null }),
    }));
    const orgInsert = jest.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "personal-2" }, error: null }),
      }),
    }));

    const orgMembershipInsert = jest.fn(async () => ({ error: null }));
    const orgMembershipSelect = jest.fn(() => ({
      eq: async () => ({ data: [], error: null }),
    }));
    const orgMembershipDelete = jest.fn(() => ({
      eq: () => ({
        in: async () => ({ data: null, error: null }),
      }),
    }));

    const reportSharesSelect = jest.fn(() => ({
      eq: () => ({
        in: () => ({
          order: async () => ({
            data: [
              {
                id: "share-new",
                source_report_id: "source-report-1",
                status: "emailed",
                created_at: "2026-02-12T10:00:00.000Z",
              },
              {
                id: "share-old",
                source_report_id: "source-report-1",
                status: "emailed",
                created_at: "2026-02-11T10:00:00.000Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    }));

    const promoteIn = jest.fn(async () => ({ error: null }));
    const rejectIn = jest.fn(async () => ({ error: null }));
    const reportSharesUpdate = jest.fn((payload: unknown) => {
      const status = (payload as { status?: string }).status;
      if (status === "pending") {
        return { in: promoteIn };
      }
      return { in: rejectIn };
    });

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
            upsert: profileUpsert,
            update: profileUpdate,
          };
        }
        if (table === "students") {
          return buildSelectList({ data: [], error: null });
        }
        if (table === "organizations") {
          return { select: orgSelect, insert: orgInsert };
        }
        if (table === "org_memberships") {
          return {
            insert: orgMembershipInsert,
            select: orgMembershipSelect,
            delete: orgMembershipDelete,
          };
        }
        if (table === "report_shares") {
          return {
            select: reportSharesSelect,
            update: reportSharesUpdate,
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(promoteIn).toHaveBeenCalledWith("id", ["share-new"]);
    expect(rejectIn).toHaveBeenCalledWith("id", ["share-old"]);
    expect(reportSharesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_user_id: "coach-2",
        recipient_org_id: "personal-2",
        status: "pending",
        delivery: "in_app",
      })
    );
  });

  it("hydrates student profile full_name from linked student record when missing", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "student-user-1",
              email: "camille@example.com",
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileSelect = jest.fn(() => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: "student-user-1",
            role: "student",
            org_id: "org-old",
            full_name: null,
            active_workspace_id: null,
          },
          error: null,
        }),
      }),
    }));
    const profileUpdateEq = jest.fn(async () => ({ error: null }));
    const profileUpdate = jest.fn(() => ({ eq: profileUpdateEq }));

    const orgSelect = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "personal-1" }, error: null }),
        }),
      }),
      in: async () => ({ data: [], error: null }),
    }));

    const studentAccountsUpsert = jest.fn(async () => ({ error: null }));
    const appActivityInsert = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
            update: profileUpdate,
          };
        }
        if (table === "organizations") {
          return {
            select: orgSelect,
          };
        }
        if (table === "students") {
          return buildSelectList({
            data: [
              {
                id: "student-1",
                org_id: "org-1",
                first_name: "Camille",
                last_name: "Dupont",
                created_at: "2026-02-16T10:00:00.000Z",
              },
            ],
            error: null,
          });
        }
        if (table === "student_accounts") {
          return {
            upsert: studentAccountsUpsert,
          };
        }
        if (table === "app_activity_logs") {
          return {
            insert: appActivityInsert,
          };
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe("student");
    expect(studentAccountsUpsert).toHaveBeenCalledWith(
      [{ student_id: "student-1", user_id: "student-user-1" }],
      { onConflict: "student_id" }
    );
    expect(profileUpdate).toHaveBeenCalledWith({ full_name: "Camille Dupont" });
    expect(profileUpdate).toHaveBeenCalledWith({
      org_id: "org-1",
      active_workspace_id: "org-1",
    });
  });
});
