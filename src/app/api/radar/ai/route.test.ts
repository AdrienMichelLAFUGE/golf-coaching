import { POST } from "./route";

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

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("POST /api/radar/ai", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));
    if (!response) {
      throw new Error("Missing response");
    }

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
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({});

    const response = await POST(buildRequest({ mode: "questions" }));
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Non autorise.");
  });
});
