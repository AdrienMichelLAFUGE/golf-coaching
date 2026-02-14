if (process.env.NODE_ENV !== "test") {
  // server-only throws in Jest; keep the guard in non-test environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";

const BACKOFFICE_SESSION_COOKIE = "sf_backoffice_access";
const BACKOFFICE_DEFAULT_TTL_HOURS = 8;
const BACKOFFICE_MIN_SECRET_LENGTH = 32;

type BackofficeSessionPayload = {
  username: string;
  expiresAt: number;
};

type BackofficeConfig =
  | {
      enabled: false;
      misconfigured: false;
      reason: null;
      credentials: Map<string, string>;
      ttlSeconds: number;
      secret: null;
    }
  | {
      enabled: true;
      misconfigured: boolean;
      reason: string | null;
      credentials: Map<string, string>;
      ttlSeconds: number;
      secret: string | null;
    };

export type BackofficeProtectionState = {
  enabled: boolean;
  unlocked: boolean;
  misconfigured: boolean;
  reason: string | null;
  username: string | null;
};

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const parseBackofficeCredentials = () => {
  const raw = env.BACKOFFICE_ADMIN_CREDENTIALS?.trim() ?? "";
  const map = new Map<string, string>();
  if (!raw) return map;

  raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex >= entry.length - 1) return;

      const identifier = normalizeIdentifier(entry.slice(0, separatorIndex));
      const password = entry.slice(separatorIndex + 1).trim();
      if (!identifier || !password) return;
      map.set(identifier, password);
    });

  return map;
};

const resolveBackofficeConfig = (): BackofficeConfig => {
  const credentials = parseBackofficeCredentials();
  const ttlHours = env.BACKOFFICE_SESSION_TTL_HOURS ?? BACKOFFICE_DEFAULT_TTL_HOURS;
  const ttlSeconds = ttlHours * 60 * 60;

  // Keep tests deterministic unless explicitly forced.
  if (
    process.env.NODE_ENV === "test" &&
    process.env.BACKOFFICE_LOCK_IN_TEST !== "true"
  ) {
    return {
      enabled: false,
      misconfigured: false,
      reason: null,
      credentials,
      ttlSeconds,
      secret: null,
    };
  }

  if (credentials.size === 0) {
    return {
      enabled: false,
      misconfigured: false,
      reason: null,
      credentials,
      ttlSeconds,
      secret: null,
    };
  }

  const secret = env.BACKOFFICE_SESSION_SECRET?.trim() ?? "";
  if (secret.length < BACKOFFICE_MIN_SECRET_LENGTH) {
    return {
      enabled: true,
      misconfigured: true,
      reason: `BACKOFFICE_SESSION_SECRET doit contenir au moins ${BACKOFFICE_MIN_SECRET_LENGTH} caracteres.`,
      credentials,
      ttlSeconds,
      secret: null,
    };
  }

  return {
    enabled: true,
    misconfigured: false,
    reason: null,
    credentials,
    ttlSeconds,
    secret,
  };
};

const readCookie = (request: Request, cookieName: string): string | null => {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));

  if (!match) return null;
  return match.slice(cookieName.length + 1) || null;
};

const buildSignature = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const parseBackofficeToken = (
  token: string,
  secret: string
): BackofficeSessionPayload | null => {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = buildSignature(payloadB64, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const rawPayload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const parsed = JSON.parse(rawPayload) as {
      username?: unknown;
      expiresAt?: unknown;
    };
    if (typeof parsed.username !== "string") return null;
    if (typeof parsed.expiresAt !== "number") return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) return null;
    return {
      username: parsed.username,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
};

const buildBackofficeToken = (username: string, secret: string, ttlSeconds: number) => {
  const payload: BackofficeSessionPayload = {
    username,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = buildSignature(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

const createBackofficeCookieOptions = (maxAge: number) => ({
  name: BACKOFFICE_SESSION_COOKIE,
  value: "",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export const getBackofficeProtectionState = (
  request: Request
): BackofficeProtectionState => {
  const config = resolveBackofficeConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      unlocked: true,
      misconfigured: false,
      reason: null,
      username: null,
    };
  }

  if (config.misconfigured || !config.secret) {
    return {
      enabled: true,
      unlocked: false,
      misconfigured: true,
      reason: config.reason,
      username: null,
    };
  }

  const token = readCookie(request, BACKOFFICE_SESSION_COOKIE);
  const session = token ? parseBackofficeToken(token, config.secret) : null;

  return {
    enabled: true,
    unlocked: Boolean(session),
    misconfigured: false,
    reason: null,
    username: session?.username ?? null,
  };
};

export const assertBackofficeUnlocked = (request: Request): NextResponse | null => {
  const state = getBackofficeProtectionState(request);
  if (!state.enabled) return null;

  if (state.misconfigured) {
    return NextResponse.json(
      {
        error:
          state.reason ??
          "Backoffice verrouille: configuration de securite invalide.",
        code: "BACKOFFICE_LOCK_MISCONFIGURED",
      },
      { status: 500 }
    );
  }

  if (!state.unlocked) {
    return NextResponse.json(
      {
        error: "Backoffice verrouille. Debloquez l acces avec identifiant + mot de passe.",
        code: "BACKOFFICE_LOCK_REQUIRED",
      },
      { status: 423 }
    );
  }

  return null;
};

export const verifyBackofficeCredentials = (
  identifier: string,
  password: string
): boolean => {
  const config = resolveBackofficeConfig();
  if (!config.enabled || config.misconfigured) return false;

  const expected = config.credentials.get(normalizeIdentifier(identifier));
  if (!expected) return false;

  const providedBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

export const createBackofficeLoginResponse = (identifier: string): NextResponse => {
  const config = resolveBackofficeConfig();
  if (!config.enabled || config.misconfigured || !config.secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          config.reason ??
          "Backoffice verrouille: configuration de securite invalide.",
      },
      { status: 500 }
    );
  }

  const token = buildBackofficeToken(
    normalizeIdentifier(identifier),
    config.secret,
    config.ttlSeconds
  );
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...createBackofficeCookieOptions(config.ttlSeconds),
    value: token,
  });
  return response;
};

export const createBackofficeLogoutResponse = (): NextResponse => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(createBackofficeCookieOptions(0));
  return response;
};

