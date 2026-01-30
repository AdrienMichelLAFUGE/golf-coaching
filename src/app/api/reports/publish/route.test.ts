import { createHash } from "node:crypto";
import { POST } from "./route";

jest.mock("server-only", () => ({}));

const openAiCreate = jest.fn();

jest.mock("openai", () => {
  return function OpenAI() {
    return {
      responses: {
        create: openAiCreate,
      },
    };
  };
});

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

const hashContent = (value: string) =>
  createHash("sha256").update(value.trim()).digest("hex");

describe("POST /api/reports/publish", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    openAiCreate.mockReset();
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

  it("returns 403 when report org does not match profile", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "reports") {
          return buildSelectSingle({
            data: { id: "report-1", student_id: "student-1", sent_at: null },
            error: null,
          });
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: "org-1" }, error: null });
        }
        if (table === "students") {
          return buildSelectSingle({ data: { org_id: "org-2" }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);

    const response = await POST(buildRequest({ reportId: "report-1" }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Acces refuse.");
    expect(openAiCreate).not.toHaveBeenCalled();
    expect(serverMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("skips OpenAI when formatted hash matches", async () => {
    const content = "Contenu deja formate.";
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", email: "coach@example.com" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "reports") {
          return buildSelectSingle({
            data: { id: "report-1", student_id: "student-1", sent_at: null },
            error: null,
          });
        }
        if (table === "profiles") {
          return buildSelectSingle({ data: { org_id: "org-1" }, error: null });
        }
        if (table === "students") {
          return buildSelectSingle({ data: { org_id: "org-1" }, error: null });
        }
        return buildSelectSingle({ data: null, error: null });
      },
    } as SupabaseClient;

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "report_sections") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "section-1",
                      title: "Intro",
                      type: "text",
                      content,
                      content_formatted: "Formate",
                      content_format_hash: hashContent(content),
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "reports") {
          return {
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest({ reportId: "report-1" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.formattedSections).toBe(0);
    expect(openAiCreate).not.toHaveBeenCalled();
  });
});
