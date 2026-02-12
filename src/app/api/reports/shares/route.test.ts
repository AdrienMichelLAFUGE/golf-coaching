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

  it("creates an in-app pending share when recipient has a coach account", async () => {
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
                  data: [{ title: "Observation", content: "Contenu" }],
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
          let targetId = "";
          const chain = {
            select: () => chain,
            eq: (_column: string, value: string) => {
              targetId = value;
              return chain;
            },
            maybeSingle: async () => {
              if (targetId === "sender-1") {
                return {
                  data: {
                    id: "sender-1",
                    role: "coach",
                    org_id: "org-1",
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
                  full_name: "Coach Target",
                },
                error: null,
              };
            },
          };
          return chain;
        }
        if (table === "report_shares") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            insert: reportShareInsert,
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
      buildRequest({ reportId: "00000000-0000-0000-0000-000000000001", recipientEmail: "target@example.com" })
    );

    expect(response.status).toBe(200);
    expect(reportShareInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pending",
          delivery: "in_app",
          recipient_user_id: "target-1",
        }),
      ])
    );
    expect(sendTransacEmailMock).not.toHaveBeenCalled();
  });

  it("sends external email with student name and login link when recipient has no account", async () => {
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
                      media_urls: null,
                      radar_file_id: null,
                    },
                    {
                      title: "Images",
                      type: "image",
                      content_formatted: null,
                      content: "",
                      media_urls: ["img-1"],
                      radar_file_id: null,
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
                full_name: "Coach Sender",
              },
              error: null,
            }),
          };
          return chain;
        }
        if (table === "report_shares") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
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
    expect(reportShareMocks.buildSharedReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        studentName: "Camille Dupont",
        sections: expect.arrayContaining([
          expect.objectContaining({ type: "text" }),
          expect.objectContaining({
            type: "image",
            hasRichMedia: true,
            mediaCount: 1,
          }),
        ]),
      })
    );
    expect(sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Camille Dupont"),
        htmlContent: expect.stringContaining("Eleve: <strong>Camille Dupont</strong>"),
      })
    );
    expect(sendTransacEmailMock.mock.calls[0][0].htmlContent).toContain("/login");
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
