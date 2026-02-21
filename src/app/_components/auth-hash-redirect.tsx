"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LEGACY_EMAIL_CHANGE_MESSAGE = "confirm link sent to the other email";

const parseSupabaseAuthHash = (hash: string) => {
  if (!hash.startsWith("#") || !hash.includes("=")) {
    return null;
  }

  const params = new URLSearchParams(hash.slice(1));
  const isSupabaseHash =
    params.has("message") ||
    params.has("error") ||
    params.has("error_code") ||
    params.has("error_description") ||
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("type") ||
    params.has("sb");

  if (!isSupabaseHash) {
    return null;
  }

  return params;
};

const isLegacyEmailChangeHash = (params: URLSearchParams) => {
  const message = (params.get("message") ?? "").trim().toLowerCase();
  return message.includes(LEGACY_EMAIL_CHANGE_MESSAGE);
};

export default function AuthHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    const params = parseSupabaseAuthHash(hash);
    if (!params) {
      return;
    }

    const message = (params.get("message") ?? "").trim();

    if (isLegacyEmailChangeHash(params)) {
      const target = new URL("/auth/email-change", window.location.origin);
      target.searchParams.set("source", "unknown");
      if (message.length > 0) {
        target.searchParams.set("legacyMessage", message);
      }

      router.replace(`${target.pathname}${target.search}`);
      return;
    }

    const callbackTarget = new URL("/auth/callback", window.location.origin);
    if (message.length > 0) {
      callbackTarget.searchParams.set("message", message);
    }

    router.replace(`${callbackTarget.pathname}${callbackTarget.search}${hash}`);
  }, [router]);

  return null;
}
