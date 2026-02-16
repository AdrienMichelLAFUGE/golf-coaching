import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { waitForRecoveredSession } from "./session-recovery";

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

type MockAuth = {
  getSession: jest.Mock<Promise<{ data: { session: Session | null } }>, []>;
  onAuthStateChange: jest.Mock<
    { data: { subscription: { unsubscribe: () => void } } },
    [AuthListener]
  >;
  emit: (event: AuthChangeEvent, session: Session | null) => void;
  unsubscribe: jest.Mock<void, []>;
};

const createMockSession = (email: string): Session =>
  ({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: 9999999999,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
      email,
    },
  } as Session);

const createMockAuth = (sessions: Array<Session | null>): MockAuth => {
  const listeners: AuthListener[] = [];
  const unsubscribe = jest.fn();
  const getSession = jest.fn(async () => ({
    data: {
      session:
        sessions.length > 1
          ? (sessions.shift() as Session | null)
          : (sessions[0] as Session | null),
    },
  }));
  const onAuthStateChange = jest.fn((callback: AuthListener) => {
    listeners.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe,
        },
      },
    };
  });
  const emit = (event: AuthChangeEvent, session: Session | null) => {
    listeners.forEach((listener) => listener(event, session));
  };

  return {
    getSession,
    onAuthStateChange,
    emit,
    unsubscribe,
  };
};

describe("waitForRecoveredSession", () => {
  it("returns immediately when a session already exists", async () => {
    const session = createMockSession("coach@example.com");
    const auth = createMockAuth([session]);

    const resolved = await waitForRecoveredSession(auth);

    expect(resolved?.user.email).toBe("coach@example.com");
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it("waits for INITIAL_SESSION and resolves with recovered session", async () => {
    const session = createMockSession("student@example.com");
    const auth = createMockAuth([null, null]);

    const pending = waitForRecoveredSession(auth, { timeoutMs: 1000 });
    auth.emit("INITIAL_SESSION", session);
    const resolved = await pending;

    expect(resolved?.user.email).toBe("student@example.com");
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it("resolves null when no session is recovered before timeout", async () => {
    jest.useFakeTimers();
    const auth = createMockAuth([null, null, null]);

    const pending = waitForRecoveredSession(auth, { timeoutMs: 100 });
    await jest.advanceTimersByTimeAsync(150);
    const resolved = await pending;

    expect(resolved).toBeNull();
    expect(auth.unsubscribe).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
