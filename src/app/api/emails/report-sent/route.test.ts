import { POST } from "./route";

jest.mock("server-only", () => ({}));

const sendTransacEmail = jest.fn().mockResolvedValue({});
const setApiKey = jest.fn();

jest.mock("@getbrevo/brevo", () => ({
  __esModule: true,
  default: {
    TransactionalEmailsApi: jest.fn().mockImplementation(() => ({
      setApiKey,
      sendTransacEmail,
    })),
    TransactionalEmailsApiApiKeys: { apiKey: "apiKey" },
  },
}));

const buildRequest = (payload: unknown) =>
  ({
    json: async () => payload,
    headers: {
      get: () => null,
    },
  }) as unknown as Request;

describe("POST /api/emails/report-sent", () => {
  beforeEach(() => {
    sendTransacEmail.mockClear();
    setApiKey.mockClear();
  });

  it("returns 422 for invalid payload", async () => {
    const response = await POST(buildRequest({}));
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Payload invalide.");
    expect(sendTransacEmail).not.toHaveBeenCalled();
  });

  it("sends a transactional email", async () => {
    const response = await POST(
      buildRequest({
        to: "student@example.com",
        studentName: "Alex",
        reportTitle: "Bilan",
        reportUrl: "https://example.com/report",
      })
    );
    if (!response) {
      throw new Error("Missing response");
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(sendTransacEmail).toHaveBeenCalledTimes(1);
    expect(sendTransacEmail.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        to: [{ email: "student@example.com" }],
        subject: "Votre rapport est pret: Bilan",
      })
    );
  });
});
