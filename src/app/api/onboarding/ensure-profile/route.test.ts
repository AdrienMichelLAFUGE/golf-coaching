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
  });
});
