import { z } from "zod";

export const GLOBAL_SEARCH_KIND_VALUES = ["page", "student", "report", "test"] as const;

export const GlobalSearchItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(GLOBAL_SEARCH_KIND_VALUES),
  title: z.string().min(1),
  subtitle: z.string().max(220).nullable().optional(),
  href: z.string().min(1),
});

export const GlobalSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(GlobalSearchItemSchema),
});

export type GlobalSearchKind = (typeof GLOBAL_SEARCH_KIND_VALUES)[number];
export type GlobalSearchItem = z.infer<typeof GlobalSearchItemSchema>;
export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponseSchema>;
