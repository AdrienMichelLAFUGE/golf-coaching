import { DELETE, GET, PATCH } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
};

type AdminClient = {
  auth: {
    admin: {
      deleteUser: jest.Mock;
      getUserById?: jest.Mock;
    };
  };
  from: jest.Mock;
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("DELETE /api/admin/coaches", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 403 when user is not admin", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await DELETE(buildRequest({ coachId: "coach-1" }));

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(403);
  });

  it("returns 422 for invalid payload", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { deleteUser: jest.fn() } },
      from: jest.fn(),
    } as AdminClient);

    const response = await DELETE(buildRequest({}));

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(422);
  });

  it("blocks deleting the current admin account", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { deleteUser: jest.fn() } },
      from: jest.fn(),
    } as AdminClient);

    const response = await DELETE(buildRequest({ coachId: "admin-1" }));

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Impossible de supprimer votre compte.");
  });

  it("retries delete after profile cleanup on database error", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" },
          },
          error: null,
        }),
      },
    } as SupabaseClient;

    const deleteUser = jest
      .fn()
      .mockResolvedValueOnce({
        error: { message: "Database error deleting user" },
      })
      .mockResolvedValueOnce({ error: null });
    const eq = jest.fn().mockResolvedValue({ error: null });
    const deleteProfile = jest.fn().mockReturnValue({ eq });
    const tpiEq = jest.fn().mockResolvedValue({ error: null });
    const updateTpi = jest.fn().mockReturnValue({ eq: tpiEq });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { deleteUser } },
      from: jest.fn((table: string) => {
        if (table === "tpi_reports") {
          return { update: updateTpi };
        }
        if (table === "profiles") {
          return { delete: deleteProfile };
        }
        return { delete: jest.fn() };
      }),
    } as AdminClient);

    const response = await DELETE(buildRequest({ coachId: "coach-1" }));

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(2);
    expect(updateTpi).toHaveBeenCalledWith({ uploaded_by: null });
    expect(tpiEq).toHaveBeenCalledWith("uploaded_by", "coach-1");
    expect(deleteProfile).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", "coach-1");
  });
});

describe("GET /api/admin/coaches", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns workspace rows with coach info", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      auth: {
        admin: {
          deleteUser: jest.fn(),
          getUserById: jest.fn(async (id: string) => ({
            data: { user: { id, email: "coach@example.com" } },
            error: null,
          })),
        },
      },
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                {
                  id: "org-personal",
                  name: "Espace personnel",
                  workspace_type: "personal",
                  owner_profile_id: "coach-1",
                  plan_tier: "standard",
                  ai_enabled: true,
                  tpi_enabled: false,
                  radar_enabled: false,
                  coaching_dynamic_enabled: false,
                  ai_model: "gpt-5-mini",
                },
                {
                  id: "org-club",
                  name: "Club",
                  workspace_type: "org",
                  owner_profile_id: null,
                  plan_tier: "free",
                  ai_enabled: false,
                  tpi_enabled: false,
                  radar_enabled: false,
                  coaching_dynamic_enabled: false,
                  ai_model: "gpt-5-mini",
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "org_memberships") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                {
                  id: "m-student",
                  org_id: "org-personal",
                  role: "admin",
                  status: "active",
                  user_id: "student-1",
                },
                {
                  id: "m1",
                  org_id: "org-personal",
                  role: "admin",
                  status: "active",
                  user_id: "coach-1",
                },
                {
                  id: "m2",
                  org_id: "org-club",
                  role: "admin",
                  status: "active",
                  user_id: "coach-1",
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({
                data: [
                  { id: "coach-1", full_name: "Coach A", role: "coach" },
                  { id: "student-1", full_name: "Eleve", role: "student" },
                ],
                error: null,
              }),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest({}));

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workspaces).toHaveLength(2);
    expect(body.workspaces[0]).toEqual(
      expect.objectContaining({
        id: "org-personal",
        workspace_type: "personal",
        coach: expect.objectContaining({
          id: "coach-1",
          email: "coach@example.com",
        }),
      })
    );
  });
});

describe("PATCH /api/admin/coaches", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("updates profile premium when changing plan tier on personal workspace", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const orgSelectSingle = jest.fn(async () => ({
      data: {
        id: "org-personal",
        workspace_type: "personal",
        owner_profile_id: "coach-1",
      },
      error: null,
    }));
    const orgSelect = jest.fn(() => ({
      eq: () => ({
        single: orgSelectSingle,
      }),
    }));
    const orgUpdateEq = jest.fn(async () => ({ error: null }));
    const orgUpdate = jest.fn(() => ({ eq: orgUpdateEq }));
    const profileUpdateEq = jest.fn(async () => ({ error: null }));
    const profileUpdate = jest.fn(() => ({ eq: profileUpdateEq }));

    const admin = {
      auth: { admin: { deleteUser: jest.fn() } },
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return { select: orgSelect, update: orgUpdate };
        }
        if (table === "profiles") {
          return { update: profileUpdate };
        }
        return {};
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({ orgId: "org-personal", plan_tier: "standard" })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(orgSelect).toHaveBeenCalled();
    expect(orgUpdate).toHaveBeenCalledWith({
      plan_tier: "standard",
      ai_enabled: true,
      tpi_enabled: true,
      radar_enabled: true,
      coaching_dynamic_enabled: true,
    });
    expect(orgUpdateEq).toHaveBeenCalledWith("id", "org-personal");
    expect(profileUpdate).toHaveBeenCalledWith({ premium_active: true });
    expect(profileUpdateEq).toHaveBeenCalledWith("id", "coach-1");
  });
});
