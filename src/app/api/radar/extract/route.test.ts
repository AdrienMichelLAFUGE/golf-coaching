import {
  POST,
  computeTabularReviewReasons,
  deriveTabularRowPrefixCount,
  selectTabularDataColumnIndexes,
} from "./route";

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

  it("returns 422 when smart2move graph type is missing", async () => {
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
              source: "smart2move",
            },
            error: null,
          });
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

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain("Type de graphe Smart2Move requis");
  });

  it("returns 422 when smart2move impact marker is missing", async () => {
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
              source: "smart2move",
            },
            error: null,
          });
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

    const response = await POST(
      buildRequest({ radarFileId: "radar-1", smart2MoveGraphType: "fx" })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain("Position d impact requise");
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

describe("radar tabular normalization helpers", () => {
  it("keeps only data columns when shot-like headers are duplicated", () => {
    const indexes = selectTabularDataColumnIndexes([
      { label: "#" },
      { label: "Shot" },
      { label: "Ball Speed" },
      { label: "Spin" },
    ]);

    expect(indexes).toEqual([2, 3]);
  });

  it("detects two shot-prefix values when row includes # and shot", () => {
    const prefix = deriveTabularRowPrefixCount({
      values: [1, 1, 167.2, 2450],
      dataColumnCount: 2,
      rowShot: 1,
      rowCount: 12,
    });

    expect(prefix).toBe(2);
  });

  it("falls back to one prefix when row shot is missing", () => {
    const prefix = deriveTabularRowPrefixCount({
      values: ["12", 165.1, 2380],
      dataColumnCount: 2,
      rowShot: null,
      rowCount: 20,
    });

    expect(prefix).toBe(1);
  });

  it("flags review when there are no data columns", () => {
    const reasons = computeTabularReviewReasons({
      dataColumnKeys: [],
      shots: [{ shot_index: 1 }],
    });

    expect(reasons).toContain("Aucune colonne de donnees detectee.");
  });

  it("flags review when numeric payload is empty", () => {
    const reasons = computeTabularReviewReasons({
      dataColumnKeys: ["shot_type"],
      shots: [
        { shot_index: 1, shot_type: "draw" },
        { shot_index: 2, shot_type: "fade" },
      ],
    });

    expect(reasons).toContain("Aucune valeur numerique fiable detectee.");
  });

  it("does not flag review on coherent numeric rows", () => {
    const reasons = computeTabularReviewReasons({
      dataColumnKeys: ["speed_ball", "spin_rpm"],
      shots: [
        { shot_index: 1, speed_ball: 158.3, spin_rpm: 2420 },
        { shot_index: 2, speed_ball: 159.1, spin_rpm: 2380 },
        { shot_index: 3, speed_ball: 157.8, spin_rpm: 2490 },
      ],
    });

    expect(reasons).toHaveLength(0);
  });
});
