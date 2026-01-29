const originalEnv = process.env;

describe("envClient", () => {
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

    jest.isolateModules(() => {
      const { envClient } = require("./env.client");
      expect(envClient.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:54321");
      expect(envClient.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("test-anon-key");
    });
  });

  it("throws when NODE_ENV=production and vars are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => {
      jest.isolateModules(() => {
        require("./env.client");
      });
    }).toThrow(/Invalid public env vars/);
  });
});
