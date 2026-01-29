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
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;

    jest.isolateModules(() => {
      const { env } = require("./env");
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:54321");
      expect(env.OPENAI_API_KEY).toBe("test-openai-key");
    });
  });

  it("throws when NODE_ENV=production and vars are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;

    expect(() => {
      jest.isolateModules(() => {
        require("./env");
      });
    }).toThrow(/Invalid server env vars/);
  });
});
