import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("openai", () => {
  return function OpenAI() {
    return {
      responses: {
        create: jest.fn(),
      },
    };
  };
});

jest.mock("@/lib/promptLoader", () => ({
  applyTemplate: (template: string) => template,
  loadPromptSection: async () => "prompt",
}));

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
      eq: (...args: unknown[]) => { maybeSingle: () => Promise<QueryResult> };
    };
  };
};

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

const buildSelectMaybeSingle = (result: QueryResult) => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => result,
    }),
  }),
});

describe("POST /api/ai", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("returns 401 when user is not authenticated", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => buildSelectMaybeSingle({ data: null, error: null }),
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({});

    const response = await POST(buildRequest({}));
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized.");
  });

  it("returns 403 when AI is disabled for the org", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return buildSelectMaybeSingle({
            data: { role: "coach", org_id: "org-1" },
            error: null,
          });
        }
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: {
              id: "org-1",
              ai_enabled: false,
              ai_model: "gpt-5-mini",
              ai_tone: null,
              ai_tech_level: null,
              ai_style: null,
              ai_length: null,
              ai_imagery: null,
              ai_focus: null,
            },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue({});

    const response = await POST(buildRequest({ action: "write" }));
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("AI disabled.");
  });
});
