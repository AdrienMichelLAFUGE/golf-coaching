import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/activity-log", () => ({
  recordActivity: jest.fn(async () => undefined),
}));

const sendTransacEmailMock = jest.fn(async () => undefined);
const setApiKeyMock = jest.fn();

jest.mock("@getbrevo/brevo", () => ({
  __esModule: true,
  default: {
    TransactionalEmailsApi: class {
      setApiKey = setApiKeyMock;
      sendTransacEmail = sendTransacEmailMock;
    },
    TransactionalEmailsApiApiKeys: {
      apiKey: "apiKey",
    },
  },
}));

type QueryResult = { data: unknown; error?: { message?: string } | null };

type SupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: unknown | null;
    }>;
  };
  from: (table: string) => {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => { maybeSingle: () => Promise<QueryResult> };
    };
  };
};

const buildRequest = (payload: unknown, headers?: Record<string, string>) =>
  ({
    json: async () => payload,
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
  }),
});

describe("POST /api/invitations/students", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    sendTransacEmailMock.mockClear();
    setApiKeyMock.mockClear();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not authenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => buildSelectMaybeSingle({ data: null, error: null }),
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest({ studentId: "student-1" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not allowed", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { role: "student", org_id: "org-1" },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest({ studentId: "student-1" }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not activate student when target auth account already exists", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "coach-1" } }, error: null }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { role: "coach", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: {
              id: "student-1",
              org_id: "org-1",
              email: "student@example.com",
              first_name: "Camille",
              last_name: "Dupont",
            },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    const studentsUpdatePayloads: Array<Record<string, unknown>> = [];
    const admin = {
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [{ id: "student-user-1", email: "student@example.com" }],
              nextPage: null,
            },
            error: null,
          }),
          inviteUserByEmail: jest.fn(),
        },
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "student-user-1", role: "student", org_id: "org-1" },
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
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
            upsert: async () => ({ error: null }),
          };
        }
        if (table === "students") {
          return {
            update: (payload: Record<string, unknown>) => {
              studentsUpdatePayloads.push(payload);
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }
        return {};
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ studentId: "student-1" }));

    expect(response.status).toBe(200);
    expect(studentsUpdatePayloads).toHaveLength(1);
    expect(studentsUpdatePayloads[0]).toEqual(
      expect.objectContaining({ invited_at: expect.any(String) })
    );
    expect(studentsUpdatePayloads[0].activated_at).toBeUndefined();
    expect(sendTransacEmailMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when student is already linked to another account", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "coach-1" } }, error: null }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { role: "coach", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: {
              id: "student-1",
              org_id: "org-1",
              email: "student@example.com",
              first_name: "Camille",
              last_name: "Dupont",
              activated_at: "2026-01-10T10:00:00.000Z",
            },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    const upsertMock = jest.fn(async () => ({ error: null }));
    const admin = {
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [{ id: "student-user-1", email: "student@example.com" }],
              nextPage: null,
            },
            error: null,
          }),
          inviteUserByEmail: jest.fn(),
        },
      },
      from: (table: string) => {
        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { user_id: "student-user-2" },
                  error: null,
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "student-user-1", role: "student", org_id: "org-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ studentId: "student-1" }));

    expect(response.status).toBe(409);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("relinks student account when student is not activated yet", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "coach-1" } }, error: null }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { role: "coach", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "students") {
          return buildSelectMaybeSingle({
            data: {
              id: "student-1",
              org_id: "org-1",
              email: "student@example.com",
              first_name: "Camille",
              last_name: "Dupont",
              activated_at: null,
            },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    const upsertMock = jest.fn(async () => ({ error: null }));
    const admin = {
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [{ id: "student-user-1", email: "student@example.com" }],
              nextPage: null,
            },
            error: null,
          }),
          inviteUserByEmail: jest.fn(),
        },
      },
      from: (table: string) => {
        if (table === "student_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { user_id: "student-user-2" },
                  error: null,
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "student-user-1", role: "student", org_id: "org-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "students") {
          return {
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        return {};
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ studentId: "student-1" }));

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      [{ student_id: "student-1", user_id: "student-user-1" }],
      { onConflict: "student_id" }
    );
  });
});
