/* eslint-disable @typescript-eslint/no-require-imports */
const originalEnv = process.env;

describe("backoffice auth", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("is disabled when credentials are not configured", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      BACKOFFICE_LOCK_IN_TEST: "true",
    };
    delete process.env.BACKOFFICE_ADMIN_CREDENTIALS;
    delete process.env.BACKOFFICE_SESSION_SECRET;

    jest.isolateModules(() => {
      const { getBackofficeProtectionState } = require("./backoffice-auth");
      const request = {
        headers: new Headers(),
      } as Request;
      const state = getBackofficeProtectionState(request);
      expect(state.enabled).toBe(false);
      expect(state.unlocked).toBe(true);
    });
  });

  it("locks when enabled and no cookie is present", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      BACKOFFICE_LOCK_IN_TEST: "true",
      BACKOFFICE_ADMIN_CREDENTIALS: "primary-admin:StrongPassword123!;backup-admin:BackupPass456!",
      BACKOFFICE_SESSION_SECRET: "x".repeat(32),
    };

    jest.isolateModules(() => {
      const { assertBackofficeUnlocked } = require("./backoffice-auth");
      const request = {
        headers: new Headers(),
      } as Request;
      const errorResponse = assertBackofficeUnlocked(request);
      expect(errorResponse?.status).toBe(423);
    });
  });

  it("unlocks with valid credentials and signed cookie", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      BACKOFFICE_LOCK_IN_TEST: "true",
      BACKOFFICE_ADMIN_CREDENTIALS: "primary-admin:StrongPassword123!",
      BACKOFFICE_SESSION_SECRET: "x".repeat(32),
    };

    jest.isolateModules(() => {
      const {
        createBackofficeLoginResponse,
        getBackofficeProtectionState,
        verifyBackofficeCredentials,
      } = require("./backoffice-auth");

      expect(
        verifyBackofficeCredentials("primary-admin", "StrongPassword123!")
      ).toBe(true);
      expect(verifyBackofficeCredentials("primary-admin", "bad")).toBe(false);

      const loginResponse = createBackofficeLoginResponse("primary-admin");
      const setCookieHeader = loginResponse.headers.get("set-cookie");
      expect(setCookieHeader).toContain("sf_backoffice_access=");

      const cookieValue = setCookieHeader?.split(";")[0] ?? "";
      const request = {
        headers: new Headers({ cookie: cookieValue }),
      } as Request;
      const state = getBackofficeProtectionState(
        request
      );

      expect(state.enabled).toBe(true);
      expect(state.unlocked).toBe(true);
      expect(state.username).toBe("primary-admin");
    });
  });
});

export {};
