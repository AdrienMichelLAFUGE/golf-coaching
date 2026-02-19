import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentAuthContext: jest.fn(),
}));

jest.mock("@/lib/parent/invitation-rate-limit", () => ({
  enforceParentInvitationRateLimit: jest.fn(),
}));

jest.mock("@/lib/parent/invitation-token", () => ({
  hashParentInvitationToken: jest.fn(() => "a".repeat(64)),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: new Headers(),
  }) as Request;

describe("POST /api/parent/invitations/accept", () => {
  const accessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentAuthContext: jest.Mock;
  };
  const rateLimitMocks = jest.requireMock("@/lib/parent/invitation-rate-limit") as {
    enforceParentInvitationRateLimit: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimitMocks.enforceParentInvitationRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("accepts invitation and returns student id", async () => {
    const admin = {
      rpc: jest.fn(async () => ({
        data: [
          {
            invitation_id: "11111111-1111-1111-1111-111111111111",
            student_id: "22222222-2222-2222-2222-222222222222",
          },
        ],
        error: null,
      })),
    };

    accessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
        parentEmail: "parent@example.com",
      },
      failure: null,
    });

    const response = await POST(
      buildRequest({ token: "valid-token-example", secretCode: "A7K3P9Q2" })
    );

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("accept_parent_child_invitation_secure", {
      _token_hash: "a".repeat(64),
      _parent_user_id: "parent-1",
      _parent_email: "parent@example.com",
      _secret_code: "A7K3P9Q2",
    });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.studentId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("returns generic error when token is invalid or expired", async () => {
    const admin = {
      rpc: jest.fn(async () => ({
        data: [],
        error: null,
      })),
    };

    accessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
        parentEmail: "parent@example.com",
      },
      failure: null,
    });

    const response = await POST(
      buildRequest({ token: "valid-token-example", secretCode: "A7K3P9Q2" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invitation invalide ou expiree.");
  });

  it("returns 429 when rate limited", async () => {
    const admin = {
      rpc: jest.fn(async () => ({
        data: [],
        error: null,
      })),
    };

    accessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
        parentEmail: "parent@example.com",
      },
      failure: null,
    });
    rateLimitMocks.enforceParentInvitationRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 30,
    });

    const response = await POST(
      buildRequest({ token: "valid-token-example", secretCode: "A7K3P9Q2" })
    );

    expect(response.status).toBe(429);
  });
});
