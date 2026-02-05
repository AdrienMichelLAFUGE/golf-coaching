const originalEnv = process.env;

describe("env", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns test defaults when NODE_ENV=test and vars missing", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRO_PRICE_MONTH_ID;
    delete process.env.STRIPE_PRO_PRICE_YEAR_ID;
    delete process.env.STRIPE_SUCCESS_URL;
    delete process.env.STRIPE_CANCEL_URL;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { env } = require("./env");
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:54321");
      expect(env.OPENAI_API_KEY).toBe("test-openai-key");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    });
  });

  it("throws when NODE_ENV=production and vars are missing", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRO_PRICE_MONTH_ID;
    delete process.env.STRIPE_PRO_PRICE_YEAR_ID;
    delete process.env.STRIPE_SUCCESS_URL;
    delete process.env.STRIPE_CANCEL_URL;

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./env");
      });
    }).toThrow(/Invalid server env vars/);
  });
});

export {};
