"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const isSupabaseAuthHash = (hash: string) => {
  if (!hash.startsWith("#") || !hash.includes("=")) {
    return false;
  }

  const params = new URLSearchParams(hash.slice(1));
  return (
    params.has("message") ||
    params.has("error") ||
    params.has("error_code") ||
    params.has("error_description") ||
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("type") ||
    params.has("sb")
  );
};

export default function AuthHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!isSupabaseAuthHash(hash)) {
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const message = (params.get("message") ?? "").trim();

    const target = new URL("/auth/email-change", window.location.origin);
    target.searchParams.set("source", "unknown");
    if (message.length > 0) {
      target.searchParams.set("legacyMessage", message);
    }

    router.replace(`${target.pathname}${target.search}`);
  }, [router]);

  return null;
}
