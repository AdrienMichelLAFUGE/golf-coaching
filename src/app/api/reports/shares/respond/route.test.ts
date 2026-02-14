import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/reports/shares/respond", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("accepts a pending report share and creates a read-only report copy", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "recipient-1" } },
          error: null,
        }),
      },
    };

    const updateShareMock = jest.fn(() => ({
      eq: async () => ({ error: null }),
    }));
    const insertReportMock = jest.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "report-copy-1" }, error: null }),
      }),
    }));
    const insertSectionsMock = jest.fn(async () => ({ error: null }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "recipient-1",
                    role: "coach",
                    org_id: "org-recipient",
                    active_workspace_id: "org-recipient",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "report_shares") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "share-1",
                    source_report_id: "report-source-1",
                    source_org_id: "org-source",
                    recipient_user_id: "recipient-1",
                    recipient_email: "coach@example.com",
                    status: "pending",
                    payload: {},
                  },
                  error: null,
                }),
              }),
            }),
            update: updateShareMock,
          };
        }
        if (table === "reports") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "report-source-1",
                    title: "Rapport source",
                    report_date: "2026-02-12",
                    created_at: "2026-02-12T10:00:00.000Z",
                    sent_at: "2026-02-12T10:30:00.000Z",
                    coach_observations: "Obs",
                    coach_work: "Work",
                    coach_club: "Fer 7",
                  },
                  error: null,
                }),
              }),
            }),
            insert: insertReportMock,
          };
        }
        if (table === "report_sections") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      title: "Section 1",
                      content: "Contenu",
                      content_formatted: "Contenu",
                      content_format_hash: null,
                      position: 0,
                      type: "text",
                      media_urls: null,
                      media_captions: null,
                      radar_file_id: "radar-source-1",
                      radar_config: null,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            insert: insertSectionsMock,
          };
        }
        if (table === "radar_files") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "radar-source-1",
                    source: "smart2move",
                    original_name: "s2m.png",
                    file_url: "org-source/radar/s2m.png",
                    columns: [{ key: "force", group: "S2M", label: "Force", unit: "N" }],
                    shots: [{ shot_index: 1, force: 123 }],
                    stats: { avg: { force: 123 }, dev: { force: 0 } },
                    summary: "Analyse S2M",
                    config: { options: { aiContext: "{}" } },
                    analytics: null,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        shareId: "00000000-0000-0000-0000-000000000001",
        decision: "accept",
      })
    );

    expect(response.status).toBe(200);
    expect(insertReportMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          origin_share_id: "share-1",
          org_id: "org-recipient",
          student_id: null,
        }),
      ])
    );
    expect(insertSectionsMock).toHaveBeenCalled();
    expect(insertSectionsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          radar_file_id: null,
          radar_config: expect.objectContaining({
            shared_radar_snapshot_v1: expect.objectContaining({
              sourceRadarFileId: "radar-source-1",
            }),
          }),
        }),
      ])
    );
    expect(updateShareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        copied_report_id: "report-copy-1",
      })
    );
  });
});
