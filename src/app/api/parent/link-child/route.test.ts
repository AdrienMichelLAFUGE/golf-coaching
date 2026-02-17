import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentAuthContext: jest.fn(),
}));

jest.mock("@/lib/parent/secret-code", () => ({
  verifyParentSecretCode: jest.fn(),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";

describe("POST /api/parent/link-child", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentAuthContext: jest.Mock;
  };
  const secretCodeMocks = jest.requireMock("@/lib/parent/secret-code") as {
    verifyParentSecretCode: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({ firstName: "Leo" }));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
  });

  it("returns auth failure when caller is not an authenticated parent", async () => {
    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: null,
      failure: { status: 403, error: "Acces refuse." },
    });

    const response = await POST(
      buildRequest({
        firstName: "Leo",
        lastName: "Martin",
        email: "leo@example.com",
        secretCode: "A7K3P9Q2",
      })
    );

    expect(response.status).toBe(403);
  });

  it("returns generic error when student match fails", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "students") return {};
        return {
          select: () => ({
            ilike: async () => ({
              data: [],
              error: null,
            }),
          }),
        };
      }),
    };

    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
        parentEmail: "parent@example.com",
      },
      failure: null,
    });

    const response = await POST(
      buildRequest({
        firstName: "Leo",
        lastName: "Martin",
        email: "leo@example.com",
        secretCode: "A7K3P9Q2",
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe(
      "Les informations fournies ne permettent pas de rattacher un enfant."
    );
  });

  it("creates or upserts parent-child link on valid match", async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "students") {
          return {
            select: () => ({
              ilike: async () => ({
                data: [
                  {
                    id: STUDENT_ID,
                    first_name: "Leo",
                    last_name: "Martin",
                    email: "leo@example.com",
                    parent_secret_code_plain: null,
                    parent_secret_code_hash:
                      "sha256$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "parent_child_links") {
          return { upsert };
        }

        return {};
      }),
    };

    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
        parentEmail: "parent@example.com",
      },
      failure: null,
    });
    secretCodeMocks.verifyParentSecretCode.mockReturnValue(true);

    const response = await POST(
      buildRequest({
        firstName: "Leo",
        lastName: "Martin",
        email: "leo@example.com",
        secretCode: "A7K3P9Q2",
      })
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        parent_user_id: "parent-1",
        student_id: STUDENT_ID,
        parent_email: "parent@example.com",
      },
      { onConflict: "parent_user_id,student_id" }
    );
  });
});
