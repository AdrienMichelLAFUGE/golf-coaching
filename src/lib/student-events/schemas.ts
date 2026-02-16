import { z } from "zod";

export const StudentEventTypeSchema = z.enum([
  "tournament",
  "competition",
  "training",
  "other",
]);

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const MAX_EVENT_RESULTS_ROUNDS = 6;
const MAX_EVENT_RESULTS_PLACE = 9999;
const MIN_EVENT_RESULTS_SCORE = -99;
const MAX_EVENT_RESULTS_SCORE = 400;

const normalizeNullableText = (value: string | null | undefined) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureDateOrder = (
  startAt: string,
  endAt: string | null | undefined,
  ctx: z.RefinementCtx,
  endPath: (string | number)[] = ["endAt"]
) => {
  if (!endAt) return;
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return;
  if (endMs < startMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: endPath,
      message: "La date de fin doit etre apres la date de debut.",
    });
  }
};

const StudentEventRoundResultSchema = z
  .object({
    round: z.number().int().min(1).max(MAX_EVENT_RESULTS_ROUNDS),
    score: z
      .number()
      .int()
      .min(MIN_EVENT_RESULTS_SCORE)
      .max(MAX_EVENT_RESULTS_SCORE)
      .nullable(),
    place: z.number().int().min(1).max(MAX_EVENT_RESULTS_PLACE).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.score === null && value.place === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "Renseignez un score ou un classement.",
      });
    }
  });

const isResultsCompatibleType = (
  type: z.infer<typeof StudentEventTypeSchema>
) => type === "tournament" || type === "competition";

const validateResultsState = (
  value: {
    type: z.infer<typeof StudentEventTypeSchema>;
    resultsEnabled: boolean;
    resultsRoundsPlanned: number | null;
    resultsRounds: Array<z.infer<typeof StudentEventRoundResultSchema>>;
  },
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number> = []
) => {
  const path = (field: string) => [...pathPrefix, field];

  if (!value.resultsEnabled) {
    if (value.resultsRoundsPlanned !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: path("resultsRoundsPlanned"),
        message: "Desactivez les tours prevus tant que le suivi resultat est coupe.",
      });
    }
    if (value.resultsRounds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: path("resultsRounds"),
        message: "Effacez les resultats si le suivi resultat est desactive.",
      });
    }
    return;
  }

  if (!isResultsCompatibleType(value.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: path("type"),
      message: "Le suivi resultat est reserve aux tournois et competitions.",
    });
  }

  if (value.resultsRoundsPlanned === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: path("resultsRoundsPlanned"),
      message: "Choisissez le nombre de tours prevus.",
    });
    return;
  }

  const seenRounds = new Set<number>();
  value.resultsRounds.forEach((round, index) => {
    if (round.round > value.resultsRoundsPlanned!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path("resultsRounds"), index, "round"],
        message: "Le numero de tour depasse la configuration.",
      });
    }
    if (seenRounds.has(round.round)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path("resultsRounds"), index, "round"],
        message: "Chaque tour doit etre unique.",
      });
      return;
    }
    seenRounds.add(round.round);
  });
};

const normalizeResultsRounds = (
  rounds: Array<z.infer<typeof StudentEventRoundResultSchema>>
) =>
  [...rounds]
    .map((round) => ({
      round: round.round,
      score: round.score,
      place: round.place,
    }))
    .sort((a, b) => a.round - b.round);

export const StudentEventsRouteParamsSchema = z.object({
  studentId: z.string().uuid(),
});

export const EventRouteParamsSchema = z.object({
  eventId: z.string().uuid(),
});

export const StudentEventsRangeQuerySchema = z
  .object({
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
  })
  .superRefine((value, ctx) => {
    const fromMs = Date.parse(value.from);
    const toMs = Date.parse(value.to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Intervalle invalide.",
      });
      return;
    }
    if (toMs < fromMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "La date de fin doit etre apres la date de debut.",
      });
      return;
    }
    const maxRangeMs = 120 * 24 * 60 * 60 * 1000;
    if (toMs - fromMs > maxRangeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "La plage maximale autorisee est de 120 jours.",
      });
    }
  });

export const CreateStudentEventBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    type: StudentEventTypeSchema,
    startAt: IsoDateTimeSchema,
    endAt: IsoDateTimeSchema.nullish(),
    allDay: z.boolean().default(false),
    location: z.string().max(200).nullish(),
    notes: z.string().max(4000).nullish(),
    resultsEnabled: z.boolean().default(false),
    resultsRoundsPlanned: z
      .number()
      .int()
      .min(1)
      .max(MAX_EVENT_RESULTS_ROUNDS)
      .nullish(),
    resultsRounds: z.array(StudentEventRoundResultSchema).max(MAX_EVENT_RESULTS_ROUNDS).default([]),
  })
  .superRefine((value, ctx) => {
    ensureDateOrder(value.startAt, value.endAt, ctx);
    validateResultsState(
      {
        type: value.type,
        resultsEnabled: value.resultsEnabled,
        resultsRoundsPlanned: value.resultsRoundsPlanned ?? null,
        resultsRounds: value.resultsRounds,
      },
      ctx
    );
  });

export const UpdateStudentEventBodySchema = z
  .object({
    version: z.number().int().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    type: StudentEventTypeSchema.optional(),
    startAt: IsoDateTimeSchema.optional(),
    endAt: IsoDateTimeSchema.nullish(),
    allDay: z.boolean().optional(),
    location: z.string().max(200).nullish(),
    notes: z.string().max(4000).nullish(),
    resultsEnabled: z.boolean().optional(),
    resultsRoundsPlanned: z
      .number()
      .int()
      .min(1)
      .max(MAX_EVENT_RESULTS_ROUNDS)
      .nullable()
      .optional(),
    resultsRounds: z.array(StudentEventRoundResultSchema).max(MAX_EVENT_RESULTS_ROUNDS).optional(),
  })
  .superRefine((value, ctx) => {
    const hasAtLeastOnePatchField =
      value.title !== undefined ||
      value.type !== undefined ||
      value.startAt !== undefined ||
      value.endAt !== undefined ||
      value.allDay !== undefined ||
      value.location !== undefined ||
      value.notes !== undefined ||
      value.resultsEnabled !== undefined ||
      value.resultsRoundsPlanned !== undefined ||
      value.resultsRounds !== undefined;

    if (!hasAtLeastOnePatchField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["version"],
        message: "Aucune modification fournie.",
      });
      return;
    }

    if (value.startAt !== undefined && value.endAt !== undefined) {
      ensureDateOrder(value.startAt, value.endAt, ctx);
    }

    const hasResultsPatch =
      value.resultsEnabled !== undefined ||
      value.resultsRoundsPlanned !== undefined ||
      value.resultsRounds !== undefined;

    if (!hasResultsPatch) return;

    if (value.type === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message: "Le type est requis pour mettre a jour les resultats.",
      });
      return;
    }

    if (
      value.resultsEnabled === undefined ||
      value.resultsRoundsPlanned === undefined ||
      value.resultsRounds === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resultsEnabled"],
        message: "Le bloc resultat doit etre envoye complet.",
      });
      return;
    }

    validateResultsState(
      {
        type: value.type,
        resultsEnabled: value.resultsEnabled,
        resultsRoundsPlanned: value.resultsRoundsPlanned,
        resultsRounds: value.resultsRounds,
      },
      ctx
    );
  });

export const StudentEventRowSchema = z
  .object({
    id: z.string().uuid(),
    student_id: z.string().uuid(),
    title: z.string().min(1),
    type: StudentEventTypeSchema,
    start_at: IsoDateTimeSchema,
    end_at: IsoDateTimeSchema.nullable(),
    all_day: z.boolean(),
    location: z.string().nullable(),
    notes: z.string().nullable(),
    created_by: z.string().uuid(),
    updated_by: z.string().uuid(),
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
    version: z.number().int().min(1),
    results_enabled: z.boolean(),
    results_rounds_planned: z.number().int().min(1).max(MAX_EVENT_RESULTS_ROUNDS).nullable(),
    results_rounds: z.array(StudentEventRoundResultSchema),
  })
  .superRefine((row, ctx) => {
    validateResultsState(
      {
        type: row.type,
        resultsEnabled: row.results_enabled,
        resultsRoundsPlanned: row.results_rounds_planned,
        resultsRounds: row.results_rounds,
      },
      ctx,
      []
    );
  });

export type StudentEventType = z.infer<typeof StudentEventTypeSchema>;
export type StudentEventRoundResult = z.infer<typeof StudentEventRoundResultSchema>;
export type StudentEventRow = z.infer<typeof StudentEventRowSchema>;
export type CreateStudentEventBody = z.infer<typeof CreateStudentEventBodySchema>;
export type UpdateStudentEventBody = z.infer<typeof UpdateStudentEventBodySchema>;

export type StudentEventDto = {
  id: string;
  studentId: string;
  title: string;
  type: StudentEventType;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  resultsEnabled: boolean;
  resultsRoundsPlanned: number | null;
  resultsRounds: StudentEventRoundResult[];
};

export type CoachStudentEventDto = StudentEventDto & {
  studentName: string;
  studentAvatarUrl: string | null;
};

export type CoachCalendarStudentDto = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export const STUDENT_EVENT_SELECT =
  "id, student_id, title, type, start_at, end_at, all_day, location, notes, created_by, updated_by, created_at, updated_at, version, results_enabled, results_rounds_planned, results_rounds";

export const mapStudentEventRowToDto = (row: StudentEventRow): StudentEventDto => ({
  id: row.id,
  studentId: row.student_id,
  title: row.title,
  type: row.type,
  startAt: row.start_at,
  endAt: row.end_at,
  allDay: row.all_day,
  location: row.location,
  notes: row.notes,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  version: row.version,
  resultsEnabled: row.results_enabled,
  resultsRoundsPlanned: row.results_rounds_planned,
  resultsRounds: normalizeResultsRounds(row.results_rounds),
});

export const buildCreateInsertPayload = (
  input: Omit<CreateStudentEventBody, "allDay" | "resultsEnabled" | "resultsRounds"> & {
    allDay?: boolean;
    resultsEnabled?: boolean;
    resultsRounds?: StudentEventRoundResult[];
  },
  studentId: string,
  actorUserId: string
) => ({
  student_id: studentId,
  title: input.title.trim(),
  type: input.type,
  start_at: input.startAt,
  end_at: input.endAt ?? null,
  all_day: input.allDay ?? false,
  location: normalizeNullableText(input.location),
  notes: normalizeNullableText(input.notes),
  results_enabled: input.resultsEnabled ?? false,
  results_rounds_planned:
    input.resultsEnabled === true ? input.resultsRoundsPlanned ?? null : null,
  results_rounds:
    input.resultsEnabled === true
      ? normalizeResultsRounds(input.resultsRounds ?? [])
      : [],
  created_by: actorUserId,
  updated_by: actorUserId,
});

export const buildUpdatePatchPayload = (
  input: UpdateStudentEventBody,
  actorUserId: string
) => ({
  ...(input.title !== undefined ? { title: input.title.trim() } : {}),
  ...(input.type !== undefined ? { type: input.type } : {}),
  ...(input.startAt !== undefined ? { start_at: input.startAt } : {}),
  ...(input.endAt !== undefined ? { end_at: input.endAt ?? null } : {}),
  ...(input.allDay !== undefined ? { all_day: input.allDay } : {}),
  ...(input.location !== undefined ? { location: normalizeNullableText(input.location) } : {}),
  ...(input.notes !== undefined ? { notes: normalizeNullableText(input.notes) } : {}),
  ...(input.resultsEnabled !== undefined
    ? {
        results_enabled: input.resultsEnabled,
      }
    : {}),
  ...(input.resultsRoundsPlanned !== undefined
    ? {
        results_rounds_planned: input.resultsRoundsPlanned,
      }
    : {}),
  ...(input.resultsRounds !== undefined
    ? {
        results_rounds: normalizeResultsRounds(input.resultsRounds),
      }
    : {}),
  updated_by: actorUserId,
});
