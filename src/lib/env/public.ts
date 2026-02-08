// Server-only helper used by metadata routes (sitemap/robots) and marketing metadata.
// Validates and normalizes NEXT_PUBLIC_SITE_URL to a base URL without a trailing slash.

if (process.env.NODE_ENV !== "test") {
  // server-only throws in Jest; keep the guard in non-test environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

import { env } from "@/env";

export const getSiteBaseUrl = (): string => {
  const raw = env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    throw new Error("Missing NEXT_PUBLIC_SITE_URL (expected an absolute https:// URL).");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SITE_URL (${JSON.stringify(raw)}). Expected an absolute URL like https://example.com.`
    );
  }

  const normalizedPath =
    url.pathname && url.pathname !== "/"
      ? url.pathname.replace(/\/+$/, "")
      : "";

  return `${url.origin}${normalizedPath}`;
};

