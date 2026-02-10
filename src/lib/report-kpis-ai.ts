import { z } from "zod";

export const ReportKpiItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  value: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

export type ReportKpiItem = z.infer<typeof ReportKpiItemSchema>;

export const ReportKpisPayloadSchema = z.object({
  short_term: z.array(ReportKpiItemSchema).length(3),
  long_term: z.array(ReportKpiItemSchema).length(3),
  meta: z
    .object({
      sampleSize: z.number().int().min(1).max(5),
    })
    .optional(),
});

export type ReportKpisPayload = z.infer<typeof ReportKpisPayloadSchema>;

export const ReportKpisStatusSchema = z.enum(["pending", "ready", "error"]);
export type ReportKpisStatus = z.infer<typeof ReportKpisStatusSchema>;

export const ReportKpisRowSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  student_id: z.string().uuid(),
  report_id: z.string().uuid(),
  status: ReportKpisStatusSchema,
  input_hash: z.string().min(1),
  prompt_version: z.string().min(1),
  model: z.string().nullable().optional(),
  kpis_short: z.array(ReportKpiItemSchema),
  kpis_long: z.array(ReportKpiItemSchema),
  error: z.string().nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export type ReportKpisRow = z.infer<typeof ReportKpisRowSchema>;

