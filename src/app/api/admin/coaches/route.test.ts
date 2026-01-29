import { DELETE } from "./route";

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
});
