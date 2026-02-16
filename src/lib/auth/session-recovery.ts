import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type AuthSubscription = {
  unsubscribe: () => void;
};

type AuthClientLike = {
  getSession: () => Promise<{
    data: { session: Session | null };
  }>;
  onAuthStateChange: (
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ) => { data: { subscription: AuthSubscription } };
};

type SessionRecoveryOptions = {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 1200;

export const waitForRecoveredSession = async (
  auth: AuthClientLike,
  options?: SessionRecoveryOptions
): Promise<Session | null> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<Session | null>((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let subscription: AuthSubscription | null = null;

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      subscription?.unsubscribe();
      resolve(session);
    };

    const checkCurrentSession = async (allowNull: boolean) => {
      try {
        const { data } = await auth.getSession();
        if (data.session) {
          finish(data.session);
          return;
        }
        if (allowNull) finish(null);
      } catch {
        if (allowNull) finish(null);
      }
    };

    const authListener = auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        finish(null);
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        finish(session ?? null);
      }
    });

    subscription = authListener.data.subscription;

    // If Supabase doesn't emit INITIAL_SESSION quickly enough, avoid hanging forever.
    timeoutHandle = setTimeout(() => {
      void checkCurrentSession(true);
    }, timeoutMs);

    // Double-check immediately after subscription to catch a just-restored session.
    void checkCurrentSession(false);
  });
};
