jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table !== "org_invitations") {
        return {};
      }

      return {
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            lt: jest.fn(() => ({
              select: jest.fn(async () => ({
                data: [{ id: "invite-1" }, { id: "invite-2" }],
                error: null,
              })),
            })),
          })),
        })),
      };
    }),
  })),
}));

describe("GET/POST /api/orgs/invitations/expire", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    jest.doMock("@/env", () => ({
      env: {
        CRON_SECRET: undefined,
      },
    }));

    await jest.isolateModulesAsync(async () => {
      const { GET } = await import("./route");
      const response = await GET(
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
        CRON_SECRET: "expected-token",
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

  it("returns 200 and expired invitations count when token matches", async () => {
    jest.doMock("@/env", () => ({
      env: {
        CRON_SECRET: "expected-token",
      },
    }));

    await jest.isolateModulesAsync(async () => {
      const { GET } = await import("./route");
      const response = await GET(
        {
          headers: new Headers({
            authorization: "Bearer expected-token",
          }),
        } as Request
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        expiredInvitations: 2,
      });
    });
  });
});
