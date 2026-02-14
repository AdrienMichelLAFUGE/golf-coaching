jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    rpc: jest.fn(async () => ({ data: [{ redacted_messages: 4, deleted_reports: 2 }], error: null })),
  })),
}));

describe("POST /api/messages/purge", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("returns 503 when purge secret is not configured", async () => {
    jest.doMock("@/env", () => ({
      env: {
        MESSAGES_PURGE_CRON_SECRET: undefined,
      },
    }));

    await jest.isolateModulesAsync(async () => {
      const { POST } = await import("./route");
      const response = await POST(
        {
          headers: new Headers({
            authorization: "Bearer anything",
          }),
        } as Request
      );

      expect(response.status).toBe(503);
    });
  });

  it("returns 401 when token does not match", async () => {
    jest.doMock("@/env", () => ({
      env: {
        MESSAGES_PURGE_CRON_SECRET: "expected-token",
      },
    }));

    await jest.isolateModulesAsync(async () => {
      const { POST } = await import("./route");
      const response = await POST(
        {
          headers: new Headers({
            authorization: "Bearer wrong-token",
          }),
        } as Request
      );

      expect(response.status).toBe(401);
    });
  });
});
