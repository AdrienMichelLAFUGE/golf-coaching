import type { MetadataRoute } from "next";

import { getSiteBaseUrl } from "@/lib/env/public";

export const runtime = "nodejs";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteBaseUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  // Marketing routes only. Never include private routes (e.g. /app/*).
  entries.push({
    url: `${baseUrl}/login`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  });

  return entries;
}
