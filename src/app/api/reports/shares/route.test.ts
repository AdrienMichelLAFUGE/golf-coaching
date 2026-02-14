import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/report-share", () => ({
  findAuthUserByEmail: jest.fn(),
  buildSharedReportPdf: jest.fn(() => Buffer.from("pdf")),
}));

const sendTransacEmailMock = jest.fn();
const setApiKeyMock = jest.fn();

jest.mock("@getbrevo/brevo", () => ({
  __esModule: true,
  default: {
    TransactionalEmailsApi: class {
      setApiKey = setApiKeyMock;
      sendTransacEmail = sendTransacEmailMock;
    },
    TransactionalEmailsApiApiKeys: {
      apiKey: "apiKey",
    },
  },
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
  }) as Request;

describe("POST /api/reports/shares", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const reportShareMocks = jest.requireMock("@/lib/report-share") as {
    findAuthUserByEmail: jest.Mock;
    buildSharedReportPdf: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    reportShareMocks.findAuthUserByEmail.mockReset();
    reportShareMocks.buildSharedReportPdf.mockReset();
    reportShareMocks.buildSharedReportPdf.mockReturnValue(Buffer.from("pdf"));
    sendTransacEmailMock.mockReset();
    setApiKeyMock.mockReset();
  });

  it("creates a read-only copy for registered coach recipients and sends full-view email", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "sender-1", email: "sender@example.com" } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => {
        if (table === "reports") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "report-1",
                    org_id: "org-1",
                    student_id: "student-1",
                    title: "Rapport test",
                    report_date: "2026-02-12",
                    created_at: "2026-02-12T10:00:00.000Z",
                    sent_at: "2026-02-12T11:00:00.000Z",
                    coach_observations: "Obs",
                    coach_work: "Work",
                    coach_club: "Fer 7",
                    students: [{ first_name: "Camille", last_name: "Dupont" }],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "report_sections") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      title: "Datas",
                      type: "radar",
                      content: null,
                      content_formatted: null,
                      content_format_hash: null,
                      media_urls: null,
                      media_captions: null,
                      radar_file_id: "radar-source-1",
                      radar_config: { showTable: true },
                      position: 0,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const insertShareMock = jest.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "share-1" }, error: null }),
      }),
    }));
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
          let profileId = "";
          const chain = {
            select: () => chain,
            eq: (_column: string, value: string) => {
              profileId = value;
              return chain;
            },
            maybeSingle: async () => {
              if (profileId === "sender-1") {
                return {
                  data: {
                    id: "sender-1",
                    role: "coach",
                    org_id: "org-1",
                    active_workspace_id: "org-1",
                    full_name: "Coach Sender",
                  },
                  error: null,
                };
              }
              return {
                data: {
                  id: "target-1",
                  role: "coach",
                  org_id: "org-2",
                  active_workspace_id: "org-2",
                  full_name: "Coach Target",
                },
                error: null,
              };
            },
          };
          return chain;
        }

        if (table === "report_shares") {
          let statusFilter = "";
          const selectChain = {
            eq: (column: string, value: string) => {
              if (column === "status") {
                statusFilter = value;
              }
              return selectChain;
            },
            maybeSingle: async () => {
              if (statusFilter === "pending" || statusFilter === "accepted") {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return {
            select: () => selectChain,
            insert: insertShareMock,
            update: updateShareMock,
          };
        }

        if (table === "reports") {
          return {
            insert: insertReportMock,
          };
        }

        if (table === "report_sections") {
          return {
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
                    source: "trackman",
                    original_name: "trackman.png",
                    file_url: "org-source/radar/trackman.png",
                    columns: [{ key: "carry", group: "Distance", label: "Carry", unit: "m" }],
                    shots: [{ shot_index: 1, carry: 145 }],
                    stats: { avg: { carry: 145 }, dev: { carry: 0 } },
                    summary: "Analyse data",
                    config: { showTable: true },
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

    reportShareMocks.findAuthUserByEmail.mockResolvedValue({
      id: "target-1",
      email: "target@example.com",
    });

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        reportId: "00000000-0000-0000-0000-000000000001",
        recipientEmail: "target@example.com",
      })
    );

    const payload = (await response.json()) as { delivery?: string };

    expect(response.status).toBe(200);
    expect(payload.delivery).toBe("email");
    expect(insertReportMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          origin_share_id: "share-1",
          org_id: "org-2",
          student_id: null,
        }),
      ])
    );
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
        delivery: "email",
      })
    );
    expect(sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: expect.stringContaining(
          encodeURIComponent("/app/coach/rapports/report-copy-1")
        ),
      })
    );
  });

  it("sends PDF + signup link when recipient has no account", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "sender-1", email: "sender@example.com" } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => {
        if (table === "reports") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "report-1",
                    org_id: "org-1",
                    student_id: "student-1",
                    title: "Rapport test",
                    report_date: "2026-02-12",
                    created_at: "2026-02-12T10:00:00.000Z",
                    sent_at: "2026-02-12T11:00:00.000Z",
                    coach_observations: "Obs",
                    coach_work: "Work",
                    coach_club: "Fer 7",
                    students: [{ first_name: "Camille", last_name: "Dupont" }],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "report_sections") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      title: "Observation",
                      type: "text",
                      content_formatted: "**Bon rythme**",
                      content: null,
                      content_format_hash: null,
                      media_urls: null,
                      media_captions: null,
                      radar_file_id: null,
                      radar_config: null,
                      position: 0,
                    },
                    {
                      title: "Images",
                      type: "image",
                      content_formatted: null,
                      content: "",
                      content_format_hash: null,
                      media_urls: ["img-1"],
                      media_captions: null,
                      radar_file_id: null,
                      radar_config: null,
                      position: 1,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const reportShareInsert = jest.fn(async () => ({ error: null }));
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: "sender-1",
                role: "coach",
                org_id: "org-1",
                active_workspace_id: "org-1",
                full_name: "Coach Sender",
              },
              error: null,
            }),
          };
          return chain;
        }
        if (table === "report_shares") {
          let statusFilter = "";
          const selectChain = {
            eq: (column: string, value: string) => {
              if (column === "status") {
                statusFilter = value;
              }
              return selectChain;
            },
            maybeSingle: async () => {
              if (statusFilter === "pending" || statusFilter === "accepted") {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return {
            select: () => selectChain,
            insert: reportShareInsert,
          };
        }
        return {};
      }),
    };

    reportShareMocks.findAuthUserByEmail.mockResolvedValue(null);

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({
        reportId: "00000000-0000-0000-0000-000000000001",
        recipientEmail: "outside@example.com",
      })
    );

    const payload = (await response.json()) as { delivery?: string };
    expect(response.status).toBe(200);
    expect(payload.delivery).toBe("email");
    expect(sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Camille Dupont"),
        htmlContent: expect.stringContaining("login?mode=signup"),
      })
    );
    expect(reportShareInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: "emailed",
          delivery: "email",
        }),
      ])
    );
  });
});
