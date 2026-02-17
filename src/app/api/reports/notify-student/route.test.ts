import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClientFromRequest: jest.fn(),
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/report-share", () => ({
  buildSharedReportPdf: jest.fn(() => Buffer.from("pdf-content")),
}));

jest.mock("@/lib/activity-log", () => ({
  recordActivity: jest.fn(async () => {}),
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

describe("POST /api/reports/notify-student", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseServerClientFromRequest: jest.Mock;
    createSupabaseAdminClient: jest.Mock;
  };
  const reportShareMocks = jest.requireMock("@/lib/report-share") as {
    buildSharedReportPdf: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseServerClientFromRequest.mockReset();
    serverMocks.createSupabaseAdminClient.mockReset();
    reportShareMocks.buildSharedReportPdf.mockReset();
    reportShareMocks.buildSharedReportPdf.mockReturnValue(Buffer.from("pdf-content"));
    sendTransacEmailMock.mockReset();
    setApiKeyMock.mockReset();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({ reportId: "invalid" }));
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
    expect(sendTransacEmailMock).not.toHaveBeenCalled();
  });

  it("sends student notification email with PDF and deep link", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
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
                    title: "Bilan fevrier",
                    org_id: "org-1",
                    student_id: "student-1",
                    sent_at: "2026-02-16T10:00:00.000Z",
                    report_date: "2026-02-16",
                    created_at: "2026-02-16T08:00:00.000Z",
                    origin_share_id: null,
                    students: [
                      {
                        id: "student-1",
                        first_name: "Camille",
                        last_name: "Dupont",
                        email: "camille@example.com",
                      },
                    ],
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
                      content: "Bon rythme",
                      content_formatted: null,
                      media_urls: null,
                      radar_file_id: null,
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

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: "coach-1",
                role: "coach",
                org_id: "org-1",
                active_workspace_id: "org-1",
                full_name: "Coach Test",
              },
              error: null,
            }),
          };
          return chain;
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ reportId: "00000000-0000-0000-0000-000000000001" })
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(sendTransacEmailMock).toHaveBeenCalledTimes(1);
    expect(sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "camille@example.com" }],
        attachment: expect.arrayContaining([
          expect.objectContaining({
            content: Buffer.from("pdf-content").toString("base64"),
          }),
        ]),
        htmlContent: expect.stringContaining(
          encodeURIComponent("/app/eleve/rapports/report-1")
        ),
      })
    );
  });

  it("returns 400 when student email is missing", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
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
                    title: "Bilan fevrier",
                    org_id: "org-1",
                    student_id: "student-1",
                    sent_at: "2026-02-16T10:00:00.000Z",
                    report_date: "2026-02-16",
                    created_at: "2026-02-16T08:00:00.000Z",
                    origin_share_id: null,
                    students: [
                      {
                        id: "student-1",
                        first_name: "Camille",
                        last_name: "Dupont",
                        email: null,
                      },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: "coach-1",
                role: "coach",
                org_id: "org-1",
                active_workspace_id: "org-1",
                full_name: "Coach Test",
              },
              error: null,
            }),
          };
          return chain;
        }
        return {};
      }),
    };

    serverMocks.createSupabaseServerClientFromRequest.mockReturnValue(supabase);
    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(
      buildRequest({ reportId: "00000000-0000-0000-0000-000000000001" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cet eleve n a pas d email.");
    expect(sendTransacEmailMock).not.toHaveBeenCalled();
  });

  it("sends notifications to linked parents when requested", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "coach-1", email: "coach@example.com" } },
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
                    title: "Bilan fevrier",
                    org_id: "org-1",
                    student_id: "student-1",
                    sent_at: "2026-02-16T10:00:00.000Z",
                    report_date: "2026-02-16",
                    created_at: "2026-02-16T08:00:00.000Z",
                    origin_share_id: null,
                    students: [
                      {
                        id: "student-1",
                        first_name: "Camille",
                        last_name: "Dupont",
                        email: "camille@example.com",
                      },
                    ],
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
                      content: "Bon rythme",
                      content_formatted: null,
                      media_urls: null,
                      radar_file_id: null,
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

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "profiles") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: "coach-1",
                role: "coach",
                org_id: "org-1",
                active_workspace_id: "org-1",
                full_name: "Coach Test",
              },
              error: null,
            }),
          };
          return chain;
        }

        if (table === "parent_child_links") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { parent_email: "parent1@example.com" },
                  { parent_email: "parent2@example.com" },
                  { parent_email: "camille@example.com" },
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
        reportId: "00000000-0000-0000-0000-000000000001",
        sendToLinkedParents: true,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.parentRecipientsCount).toBe(2);
    expect(sendTransacEmailMock).toHaveBeenCalledTimes(3);
    expect(sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "parent1@example.com" }],
      })
    );
    expect(sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "parent2@example.com" }],
      })
    );
  });
});
