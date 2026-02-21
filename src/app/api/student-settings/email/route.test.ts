import { PATCH } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

const buildRequest = (payload: unknown) =>
  ({
    url: "https://swingflow.test/api/student-settings/email",
    json: async () => payload,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "authorization" ? "Bearer token" : null,
    },
  }) as unknown as Request;

const buildSelectMaybeSingle = (result: {
  data: unknown;
  error?: { message?: string } | null;
}) => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => result,
    }),
  }),
});

describe("PATCH /api/student-settings/email", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await PATCH(buildRequest({ email: "bad" }));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
  });

  it("returns 401 when user is not authenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: null,
        }),
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({ from: jest.fn() });

    const response = await PATCH(buildRequest({ email: "student@example.com" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
  });

  it("returns 403 when role is not student", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "student@example.com" } },
          error: null,
        }),
      },
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "user-1", role: "coach" },
            error: null,
          });
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(buildRequest({ email: "student@example.com" }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
  });

  it("updates auth email and syncs every linked student row", async () => {
    const authUpdate = jest.fn(async () => ({ data: {}, error: null }));
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "old@example.com" } },
          error: null,
        }),
        updateUser: authUpdate,
      },
    };

    const updateStudents = jest.fn(() => ({
      in: async () => ({
        error: null,
      }),
    }));

    const admin = {
      auth: {
        admin: {
          updateUserById: jest.fn(async () => ({ data: {}, error: null })),
        },
      },
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "user-1", role: "student" },
            error: null,
          });
        }
        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ student_id: "student-1" }, { student_id: "student-2" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "students") {
          return {
            update: updateStudents,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await PATCH(buildRequest({ email: "New@Example.com" }));

    expect(response.status).toBe(200);
    expect(authUpdate).toHaveBeenCalledWith(
      { email: "new@example.com" },
      expect.objectContaining({
        emailRedirectTo: expect.stringContaining("/auth/callback?flow=email-change"),
      })
    );
    expect(updateStudents).toHaveBeenCalledWith({ email: "new@example.com" });

    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      email: "new@example.com",
      syncedStudentCount: 2,
      requiresEmailConfirmation: true,
    });
  });

  it("falls back to auth REST endpoint when session-based update is unavailable", async () => {
    const authUpdate = jest.fn(async () => ({
      data: null,
      error: { message: "Auth session missing!" },
    }));
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "old@example.com" } },
          error: null,
        }),
        updateUser: authUpdate,
      },
    };

    const updateStudents = jest.fn(() => ({
      in: async () => ({
        error: null,
      }),
    }));

    const admin = {
      auth: {
        admin: {
          updateUserById: jest.fn(async () => ({ data: {}, error: null })),
        },
      },
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "user-1", role: "student" },
            error: null,
          });
        }
        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ student_id: "student-1" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "students") {
          return {
            update: updateStudents,
          };
        }
        return {};
      }),
    };

    const originalFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    global.fetch = fetchMock;
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    try {
      const response = await PATCH(buildRequest({ email: "new@example.com" }));

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/auth/v1/user"),
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            Authorization: "Bearer token",
          }),
          body: expect.stringContaining("email_redirect_to"),
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("falls back to admin auth update when REST fallback fails", async () => {
    const authUpdate = jest.fn(async () => ({
      data: null,
      error: { message: "Auth session missing!" },
    }));
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "old@example.com" } },
          error: null,
        }),
        updateUser: authUpdate,
      },
    };

    const updateStudents = jest.fn(() => ({
      in: async () => ({
        error: null,
      }),
    }));

    const updateUserById = jest.fn(async () => ({ data: {}, error: null }));
    const admin = {
      auth: {
        admin: {
          updateUserById,
        },
      },
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { id: "user-1", role: "student" },
            error: null,
          });
        }
        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ student_id: "student-1" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "students") {
          return {
            update: updateStudents,
          };
        }
        return {};
      }),
    };

    const originalFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ msg: "Invalid JWT" }),
    })) as unknown as typeof fetch;

    global.fetch = fetchMock;
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    try {
      const response = await PATCH(buildRequest({ email: "new@example.com" }));

      expect(response.status).toBe(200);
      expect(updateUserById).toHaveBeenCalledWith("user-1", {
        email: "new@example.com",
      });
      const body = await response.json();
      expect(body.requiresEmailConfirmation).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
