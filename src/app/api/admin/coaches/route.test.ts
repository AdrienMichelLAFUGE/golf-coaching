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
      deleteUser?: jest.Mock;
      updateUserById?: jest.Mock;
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
      auth: { admin: { updateUserById: jest.fn() } },
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
      auth: { admin: { updateUserById: jest.fn() } },
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

  it("anonymizes auth/profile and disables memberships", async () => {
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

    const updateUserById = jest.fn().mockResolvedValue({ error: null });
    const profileEq = jest.fn().mockResolvedValue({ error: null });
    const updateProfile = jest.fn().mockReturnValue({ eq: profileEq });
    const membershipEqStatus = jest.fn().mockResolvedValue({ error: null });
    const membershipEqUser = jest.fn().mockReturnValue({ eq: membershipEqStatus });
    const updateMembership = jest.fn().mockReturnValue({ eq: membershipEqUser });
    const tpiEq = jest.fn().mockResolvedValue({ error: null });
    const updateTpi = jest.fn().mockReturnValue({ eq: tpiEq });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { updateUserById } },
      from: jest.fn((table: string) => {
        if (table === "tpi_reports") {
          return { update: updateTpi };
        }
        if (table === "profiles") {
          return { update: updateProfile };
        }
        if (table === "org_memberships") {
          return { update: updateMembership };
        }
        return { update: jest.fn() };
      }),
    } as AdminClient);

    const response = await DELETE(buildRequest({ coachId: "coach-1" }));

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateTpi).toHaveBeenCalledWith({ uploaded_by: null });
    expect(tpiEq).toHaveBeenCalledWith("uploaded_by", "coach-1");
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: "Compte supprime", avatar_url: null })
    );
    expect(profileEq).toHaveBeenCalledWith("id", "coach-1");
    expect(updateMembership).toHaveBeenCalledWith({ status: "disabled" });
    expect(membershipEqUser).toHaveBeenCalledWith("user_id", "coach-1");
    expect(membershipEqStatus).toHaveBeenCalledWith("status", "active");
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
    const now = new Date();
    const currentDateIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10)
    ).toISOString();
    const currentTopupDateIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 9)
    ).toISOString();

    const admin = {
      auth: {
        admin: {
          updateUserById: jest.fn(),
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
                  plan_tier: "pro",
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
                  {
                    id: "coach-1",
                    full_name: "Coach A",
                    role: "coach",
                    ai_budget_enabled: true,
                    ai_budget_monthly_cents: 2500,
                  },
                  { id: "student-1", full_name: "Eleve", role: "student" },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "ai_credit_topups") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                lt: jest.fn().mockResolvedValue({
                  data: [{ amount_cents: 400, created_at: currentTopupDateIso }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ai_usage") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                lt: jest.fn().mockResolvedValue({
                  data: [
                    {
                      created_at: currentDateIso,
                      model: "gpt-5.2",
                      input_tokens: 100000,
                      output_tokens: 100000,
                      total_tokens: 200000,
                      cost_eur_cents: 145,
                    },
                  ],
                  error: null,
                }),
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
          ai_budget_enabled: true,
          ai_budget_monthly_cents: 2500,
          ai_budget_spent_cents_current_month: 145,
          ai_budget_topup_cents_current_month: 400,
          ai_budget_remaining_cents_current_month: 2755,
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

  it("blocks plan tier updates (managed by Stripe)", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const admin = {
      auth: { admin: { updateUserById: jest.fn() } },
      from: jest.fn(() => {
        return {};
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({ orgId: "org-personal", plan_tier: "pro" })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Plan gere via Stripe. Modification interdite.");
  });

  it("allows plan tier override updates", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });

    const admin = {
      auth: { admin: { updateUserById: jest.fn() } },
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "org-personal",
                    workspace_type: "personal",
                    owner_profile_id: "coach-1",
                  },
                  error: null,
                }),
              }),
            }),
            update,
          };
        }
        return {};
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({ orgId: "org-personal", plan_tier_override: "pro" })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ plan_tier_override: "pro" });
    expect(updateEq).toHaveBeenCalledWith("id", "org-personal");
  });

  it("updates coach IA budget settings", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const profileUpdate = jest.fn().mockReturnValue({ eq: profileUpdateEq });
    const profileMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: "coach-1", ai_budget_enabled: false, ai_budget_monthly_cents: null },
      error: null,
    });
    const profileSelectEq = jest.fn().mockReturnValue({ maybeSingle: profileMaybeSingle });
    const profileSelect = jest.fn().mockReturnValue({ eq: profileSelectEq });

    const admin = {
      auth: { admin: { updateUserById: jest.fn() } },
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
            update: profileUpdate,
          };
        }
        return {};
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({
        coachId: "coach-1",
        ai_budget_enabled: true,
        ai_budget_monthly_cents: 2500,
      })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(profileSelect).toHaveBeenCalledWith(
      "id, ai_budget_enabled, ai_budget_monthly_cents"
    );
    expect(profileSelectEq).toHaveBeenCalledWith("id", "coach-1");
    expect(profileUpdate).toHaveBeenCalledWith({
      ai_budget_enabled: true,
      ai_budget_monthly_cents: 2500,
    });
    expect(profileUpdateEq).toHaveBeenCalledWith("id", "coach-1");
  });

  it("adds IA credits topup for current month", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "admin-1", email: "adrien.lafuge@outlook.fr" } },
          error: null,
        }),
      },
    } as SupabaseClient;

    const profileMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: "coach-1", ai_budget_enabled: true, ai_budget_monthly_cents: 2500 },
      error: null,
    });
    const profileSelectEq = jest.fn().mockReturnValue({ maybeSingle: profileMaybeSingle });
    const profileSelect = jest.fn().mockReturnValue({ eq: profileSelectEq });
    const insertTopup = jest.fn().mockResolvedValue({ error: null });

    const admin = {
      auth: { admin: { updateUserById: jest.fn() } },
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profileSelect,
          };
        }
        if (table === "ai_credit_topups") {
          return {
            insert: insertTopup,
          };
        }
        return {};
      }),
    } as AdminClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(
      buildRequest({
        coachId: "coach-1",
        ai_credit_topup_cents: 1000,
      })
    );

    if (!response) {
      throw new Error("Missing response");
    }
    expect(response.status).toBe(200);
    expect(insertTopup).toHaveBeenCalledTimes(1);
    expect(insertTopup.mock.calls[0]?.[0]?.[0]).toEqual(
      expect.objectContaining({
        profile_id: "coach-1",
        amount_cents: 1000,
        created_by: "admin-1",
      })
    );
  });
});
