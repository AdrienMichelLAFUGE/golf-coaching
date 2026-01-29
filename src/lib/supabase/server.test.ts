type CreateClientOptions = {
  global?: {
    headers?: {
      Authorization?: string;
    };
  };
};

type CreateClientArgs = [string, string, CreateClientOptions?];

const createClient = jest.fn<unknown, CreateClientArgs>(() => ({
  auth: { getUser: jest.fn() },
  from: jest.fn(),
}));

jest.mock("server-only", () => ({}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args: CreateClientArgs) => createClient(...args),
}));

describe("supabase server helpers", () => {
  beforeEach(() => {
    createClient.mockClear();
  });

  it("creates a server client with the request auth header", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseServerClient } = require("./server");

    createSupabaseServerClient("Bearer token");

    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClient.mock.calls[0];
    expect(url).toBe("http://localhost:54321");
    expect(key).toBe("test-anon-key");
    expect(options?.global?.headers?.Authorization).toBe("Bearer token");
  });

  it("creates an admin client with the service role key", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseAdminClient } = require("./server");

    createSupabaseAdminClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key] = createClient.mock.calls[0];
    expect(url).toBe("http://localhost:54321");
    expect(key).toBe("test-service-role-key");
  });

  it("creates a server client from request headers", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseServerClientFromRequest } = require("./server");
    const req = {
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "authorization" ? "Bearer req-token" : null,
      },
    } as Request;

    createSupabaseServerClientFromRequest(req);

    const [, , options] = createClient.mock.calls[0];
    expect(options?.global?.headers?.Authorization).toBe("Bearer req-token");
  });
});
