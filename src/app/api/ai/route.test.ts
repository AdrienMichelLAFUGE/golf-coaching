import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("openai", () =>
  jest.fn(() => ({
    responses: {
      create: jest.fn(),
    },
  }))
);

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
  select: () => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => result,
    };
    return chain;
  },
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

  it("returns 403 when plan does not allow AI", async () => {
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
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: { plan_tier: "free" },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    });

    const response = await POST(buildRequest({ action: "write" }));
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Plan requis pour les fonctions IA avancees.");
  });

  it("allows proofread for free plan", async () => {
    const OpenAI = jest.requireMock("openai") as jest.Mock;
    OpenAI.mockImplementationOnce(() => ({
      responses: {
        create: jest.fn().mockResolvedValue({
          output_text: "Texte corrige",
          usage: null,
        }),
      },
    }));

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
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: { plan_tier: "free" },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    });

    const response = await POST(
      buildRequest({
        action: "improve",
        sectionTitle: "Observations",
        sectionContent: "Texte a corriger",
      })
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe("Texte corrige");
  });

  it("returns axes with tpi reasoning for axes action", async () => {
    const OpenAI = jest.requireMock("openai") as jest.Mock;
    OpenAI.mockImplementationOnce(() => ({
      responses: {
        create: jest.fn().mockResolvedValue({
          output_text: JSON.stringify({
            axes: [
              {
                section: "Diagnostic swing",
                options: [
                  {
                    title: "Axe Rouge: stabiliser la posture",
                    summary:
                      "Prioriser un repere stable au sommet pour reduire les variations de chemin.",
                    tpiReasoning: {
                      tpiLink: "Rotation thoracique limitee et compensation en extension.",
                      playerLimitation:
                        "Difficulte a conserver l inclinaison pendant la transition.",
                      golfCompensation:
                        "Drill tempo + repere visuel d appui pour stabiliser le contact.",
                    },
                  },
                  {
                    title: "Axe Orange: regularite des appuis",
                    summary:
                      "Mettre l accent sur la cadence des appuis pour limiter les variations de face.",
                    tpiReasoning: {
                      tpiLink: "Controle lombo-pelvien variable sous fatigue.",
                      playerLimitation:
                        "Instabilite pied droit sur la fin de backswing sous pression.",
                      golfCompensation:
                        "Routine d ancrage et transition plus progressive sur 3 repetitions.",
                    },
                  },
                ],
              },
            ],
          }),
          usage: null,
        }),
      },
    }));

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
    serverMocks.createSupabaseAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "organizations") {
          return buildSelectMaybeSingle({
            data: {
              plan_tier: "pro",
              plan_tier_override: null,
              plan_tier_override_starts_at: null,
              plan_tier_override_expires_at: null,
              plan_tier_override_unlimited: false,
              id: "org-1",
              workspace_type: "personal",
              owner_profile_id: "user-1",
              stripe_status: null,
              stripe_current_period_end: null,
              stripe_price_id: null,
            },
            error: null,
          });
        }
        return buildSelectMaybeSingle({ data: null, error: null });
      },
    });

    const response = await POST(
      buildRequest({
        action: "axes",
        sectionTitle: "Constats",
        sectionContent: "Perte de posture en transition sur fers moyens.",
        targetSections: ["Diagnostic swing"],
        allSections: [{ title: "Diagnostic swing", content: "" }],
        tpiContext: "Rotation thoracique limitee, controle lombo-pelvien variable.",
      })
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.axes)).toBe(true);
    expect(body.axes[0]?.options?.length).toBe(2);
    expect(body.axes[0]?.options?.[0]?.tpiReasoning).toEqual(
      expect.objectContaining({
        tpiLink: expect.any(String),
        playerLimitation: expect.any(String),
        golfCompensation: expect.any(String),
      })
    );
  });
});
