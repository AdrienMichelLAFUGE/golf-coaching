import "@testing-library/jest-dom";

if (typeof globalThis.Request === "undefined") {
  class RequestStub {
    constructor(..._args: unknown[]) {
      void _args;
    }
  }
  const globalWithRequest = globalThis as unknown as {
    Request?: unknown;
  };
  globalWithRequest.Request = RequestStub as unknown;
}

if (typeof globalThis.Headers === "undefined") {
  class HeadersStub {
    private readonly map = new Map<string, string>();

    constructor(init?: HeadersInit) {
      if (!init) return;
      if (Array.isArray(init)) {
        init.forEach(([key, value]) => this.set(key, value));
        return;
      }
      if (init instanceof Headers) {
        Array.from(init.entries()).forEach(([key, value]) => this.set(key, value));
        return;
      }
      Object.entries(init).forEach(([key, value]) => this.set(key, value));
    }

    get(key: string) {
      return this.map.get(key.toLowerCase()) ?? null;
    }

    set(key: string, value: string) {
      this.map.set(key.toLowerCase(), value);
    }

    has(key: string) {
      return this.map.has(key.toLowerCase());
    }

    entries() {
      return this.map.entries();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }

  const globalWithHeaders = globalThis as unknown as {
    Headers?: unknown;
  };
  globalWithHeaders.Headers = HeadersStub as unknown;
}

if (typeof globalThis.Response === "undefined") {
  class ResponseStub {
    readonly headers: Headers;
    readonly status: number;
    readonly ok: boolean;
    readonly statusText: string;
    readonly body: unknown;

    constructor(body?: unknown, init?: { status?: number; headers?: HeadersInit }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.statusText = "";
      this.headers = new Headers(init?.headers);
    }

    async json() {
      if (typeof this.body === "string") {
        return JSON.parse(this.body);
      }
      return this.body;
    }

    static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
      const headers = new Headers(init?.headers);
      headers.set("content-type", "application/json");
      return new ResponseStub(JSON.stringify(body), { ...init, headers });
    }
  }

  const globalWithResponse = globalThis as unknown as {
    Response?: unknown;
  };
  globalWithResponse.Response = ResponseStub as unknown;
}
