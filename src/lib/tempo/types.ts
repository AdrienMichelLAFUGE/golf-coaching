import { z } from "zod";

export const TempoModeSchema = z.enum(["notes", "decision", "report"]);
export type TempoMode = z.infer<typeof TempoModeSchema>;

export const TempoSessionStatusSchema = z.enum(["active", "archived"]);
export type TempoSessionStatus = z.infer<typeof TempoSessionStatusSchema>;

export const TempoNoteCardTypeSchema = z.enum([
  "constat",
  "consigne",
  "objectif",
  "mesure",
  "libre",
]);
export type TempoNoteCardType = z.infer<typeof TempoNoteCardTypeSchema>;

const IsoDateSchema = z.string().min(1);

export const TempoSessionSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  org_id: z.string().uuid(),
  coach_id: z.string().uuid(),
  mode: TempoModeSchema,
  title: z.string().min(1).max(140),
  club: z.string().nullable().optional(),
  status: TempoSessionStatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
});
export type TempoSession = z.infer<typeof TempoSessionSchema>;

export const TempoNoteCardSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  coach_id: z.string().uuid(),
  occurred_at: IsoDateSchema,
  card_type: TempoNoteCardTypeSchema,
  content: z.string().min(1).max(8000),
  order_index: z.number().int().min(0),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
});
export type TempoNoteCard = z.infer<typeof TempoNoteCardSchema>;

export const TempoDecisionClarificationSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});
export type TempoDecisionClarification = z.infer<typeof TempoDecisionClarificationSchema>;

export const TempoDecisionAxisSchema = z.object({
  priority: z.number().int().min(1).max(3),
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(500),
  rationale: z.string().min(1).max(1200),
  caution: z.string().min(1).max(500),
});
export type TempoDecisionAxis = z.infer<typeof TempoDecisionAxisSchema>;

export const TempoDecisionAxesResponseSchema = z.object({
  axes: z.array(TempoDecisionAxisSchema).length(3),
});
export type TempoDecisionAxesResponse = z.infer<typeof TempoDecisionAxesResponseSchema>;

export const TempoDecisionRunSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  coach_id: z.string().uuid(),
  club: z.string().min(1).max(120),
  constat: z.string().min(1).max(8000),
  coach_intent: z.string().nullable().optional(),
  clarifications_json: z.array(TempoDecisionClarificationSchema).default([]),
  axes_json: z.array(TempoDecisionAxisSchema).default([]),
  context_snapshot_json: z.record(z.string(), z.unknown()).default({}),
  created_at: IsoDateSchema,
});
export type TempoDecisionRun = z.infer<typeof TempoDecisionRunSchema>;

export const TempoContextStudentSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  playingHand: z.string().nullable(),
});
export type TempoContextStudent = z.infer<typeof TempoContextStudentSchema>;

export const TempoContextSummarySchema = z.object({
  tpi: z.string(),
  reports: z.string(),
  radar: z.string(),
  tests: z.string(),
});
export type TempoContextSummary = z.infer<typeof TempoContextSummarySchema>;

export const TempoContextResponseSchema = z.object({
  student: TempoContextStudentSchema,
  aiContext: z.string(),
  summaries: TempoContextSummarySchema,
});
export type TempoContextResponse = z.infer<typeof TempoContextResponseSchema>;

export const TempoCreateDraftReportRequestSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
});
export type TempoCreateDraftReportRequest = z.infer<typeof TempoCreateDraftReportRequestSchema>;

export const TempoCreateDraftReportResponseSchema = z.object({
  reportId: z.string().uuid(),
});
export type TempoCreateDraftReportResponse = z.infer<typeof TempoCreateDraftReportResponseSchema>;
