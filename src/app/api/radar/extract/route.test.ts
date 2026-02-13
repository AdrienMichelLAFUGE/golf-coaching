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
      data: { user: { id: string; email?: string } | null };
      error: unknown | null;
    }>;
  };
  from: (table: string) => {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => { single: () => Promise<QueryResult> };
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

const buildSelectSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      single: async () => result,
    }),
  }),
});

describe("POST /api/radar/extract", () => {
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

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
    expect(serverMocks.createSupabaseServerClientFromRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when radar file org does not match profile", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "radar_files") {
          return buildSelectSingle({
            data: {
              id: "radar-1",
              org_id: "org-1",
              student_id: "student-1",
              file_url: "org-1/path.png",
              file_mime: "image/png",
              original_name: "file.png",
              source: "flightscope",
            },
            error: null,
          });
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: "org-2" }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    const admin = {
      from: jest.fn(),
      storage: {
        from: jest.fn(),
      },
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ radarFileId: "radar-1" }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
    expect(admin.from).toHaveBeenCalledWith("app_activity_logs");
    expect(admin.storage.from).not.toHaveBeenCalled();
  });
});
