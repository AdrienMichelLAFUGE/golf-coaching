import { GET, POST } from "./route";

const mockSendTransacEmail = jest.fn(async () => ({}));
const mockSetApiKey = jest.fn();

jest.mock("server-only", () => ({}));

jest.mock("@getbrevo/brevo", () => {
  class TransactionalEmailsApi {
    setApiKey = mockSetApiKey;
    sendTransacEmail = mockSendTransacEmail;
  }

  return {
    __esModule: true,
    default: {
      TransactionalEmailsApi,
      TransactionalEmailsApiApiKeys: { apiKey: "api-key" },
    },
  };
});

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/parent/invitation-access", () => ({
  loadParentInvitationActor: jest.fn(),
}));

jest.mock("@/lib/parent/invitation-rate-limit", () => ({
  enforceParentInvitationRateLimit: jest.fn(),
}));

jest.mock("@/lib/parent/invitation-token", () => ({
  generateParentInvitationToken: jest.fn(() => "token-parent-invite"),
  hashParentInvitationToken: jest.fn(() => "a".repeat(64)),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";

const buildRequest = (payload?: unknown) =>
  ({
    headers: new Headers(),
    json: async () => payload,
  }) as Request;

describe("GET/POST /api/students/[studentId]/parent-invitations", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const accessMocks = jest.requireMock("@/lib/parent/invitation-access") as {
    loadParentInvitationActor: jest.Mock;
  };
  const rateLimitMocks = jest.requireMock("@/lib/parent/invitation-rate-limit") as {
    enforceParentInvitationRateLimit: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendTransacEmail.mockResolvedValue({});
    mockSetApiKey.mockReset();
    rateLimitMocks.enforceParentInvitationRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "actor-1" } },
          error: null,
        }),
      },
    });
    accessMocks.loadParentInvitationActor.mockResolvedValue({
      allowed: true,
      actorRole: "student",
    });
  });

  it("GET returns invitations list", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_link_invitations") return {};
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: "22222222-2222-2222-2222-222222222222",
                      target_parent_email: "parent@example.com",
                      created_by_role: "student",
                      status: "pending",
                      created_at: "2026-02-18T10:00:00.000Z",
                      expires_at: "2026-02-25T10:00:00.000Z",
                      accepted_at: null,
                      revoked_at: null,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await GET(buildRequest(), {
      params: { studentId: STUDENT_ID },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0]).toEqual(
      expect.objectContaining({
        parentEmail: "parent@example.com",
        status: "pending",
      })
    );
  });

  it("POST creates invitation, sends email and returns invite metadata", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: STUDENT_ID,
                    first_name: "Adrien",
                    last_name: "Lafuge",
                    parent_secret_code_hash:
                      "sha256$0123456789abcdef0123456789abcdef$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table !== "parent_child_link_invitations") return {};
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: { id: "33333333-3333-3333-3333-333333333333" },
                error: null,
              }),
            }),
          }),
        };
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ parentEmail: "parent@example.com", expiresInDays: 5 }),
      {
        params: { studentId: STUDENT_ID },
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);
    expect(mockSendTransacEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: expect.stringContaining("Adrien Lafuge"),
      })
    );
  });

  it("POST returns 422 when parent email is empty", async () => {
    const admin = {
      from: jest.fn(() => ({})),
    };
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ parentEmail: "" }), {
      params: { studentId: STUDENT_ID },
    });

    expect(response.status).toBe(422);
    expect(mockSendTransacEmail).not.toHaveBeenCalled();
  });

  it("POST returns 503 and revokes invitation when email send fails", async () => {
    mockSendTransacEmail.mockRejectedValueOnce(new Error("smtp down"));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: STUDENT_ID,
                    parent_secret_code_hash:
                      "sha256$0123456789abcdef0123456789abcdef$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table !== "parent_child_link_invitations") return {};
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: { id: "44444444-4444-4444-4444-444444444444" },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ parentEmail: "parent@example.com" }),
      {
        params: { studentId: STUDENT_ID },
      }
    );

    expect(response.status).toBe(503);
    expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledWith("parent_child_link_invitations");
  });

  it("POST returns 409 when student secret code is missing", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: STUDENT_ID,
                    parent_secret_code_hash: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ parentEmail: "parent@example.com" }),
      {
        params: { studentId: STUDENT_ID },
      }
    );

    expect(response.status).toBe(409);
    expect(mockSendTransacEmail).not.toHaveBeenCalled();
  });

  it("POST returns 429 when rate limit is reached", async () => {
    const admin = {
      from: jest.fn(() => ({})),
    };
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);
    rateLimitMocks.enforceParentInvitationRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 30,
    });

    const response = await POST(
      buildRequest({ parentEmail: "parent@example.com" }),
      {
        params: { studentId: STUDENT_ID },
      }
    );

    expect(response.status).toBe(429);
  });
});
