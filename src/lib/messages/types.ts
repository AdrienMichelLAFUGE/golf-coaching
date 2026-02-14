import { z } from "zod";

export const MESSAGE_THREAD_KINDS = [
  "student_coach",
  "coach_coach",
  "group",
  "group_info",
  "org_info",
  "org_coaches",
] as const;
export type MessageThreadKind = (typeof MESSAGE_THREAD_KINDS)[number];

export const messageThreadKindSchema = z.enum(MESSAGE_THREAD_KINDS);

export const MessageDtoSchema = z.object({
  id: z.number().int().positive(),
  threadId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderName: z.string().nullable(),
  senderAvatarUrl: z.string().nullable(),
  senderRole: z.enum(["owner", "coach", "staff", "student"]).nullable(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().min(1),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const MessageThreadSummarySchema = z.object({
  threadId: z.string().uuid(),
  kind: messageThreadKindSchema,
  workspaceOrgId: z.string().uuid(),
  studentId: z.string().uuid().nullable(),
  studentName: z.string().nullable(),
  groupId: z.string().uuid().nullable(),
  groupName: z.string().nullable(),
  participantAId: z.string().uuid(),
  participantAName: z.string().nullable(),
  participantBId: z.string().uuid(),
  participantBName: z.string().nullable(),
  counterpartUserId: z.string().uuid().nullable(),
  counterpartName: z.string().nullable(),
  lastMessageId: z.number().int().positive().nullable(),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  lastMessageSenderUserId: z.string().uuid().nullable(),
  unread: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  ownLastReadMessageId: z.number().int().positive().nullable(),
  ownLastReadAt: z.string().nullable(),
  counterpartLastReadMessageId: z.number().int().positive().nullable(),
  counterpartLastReadAt: z.string().nullable(),
});
export type MessageThreadSummary = z.infer<typeof MessageThreadSummarySchema>;

export const MessageInboxResponseSchema = z.object({
  threads: z.array(MessageThreadSummarySchema),
  unreadMessagesCount: z.number().int().nonnegative(),
});
export type MessageInboxResponse = z.infer<typeof MessageInboxResponseSchema>;

export const CoachContactRequestDtoSchema = z.object({
  id: z.string().uuid(),
  requesterUserId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  requesterName: z.string().nullable(),
  targetName: z.string().nullable(),
  requesterEmail: z.string().email().nullable(),
  targetEmail: z.string().email().nullable(),
  createdAt: z.string().min(1),
});
export type CoachContactRequestDto = z.infer<typeof CoachContactRequestDtoSchema>;

export const MessageContactItemSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().nullable(),
  email: z.string().email().nullable(),
  role: z.enum(["owner", "coach", "staff", "student"]),
  availability: z.enum(["same_org", "opt_in"]).optional(),
});
export type MessageContactItem = z.infer<typeof MessageContactItemSchema>;

export const MessageStudentTargetSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string(),
  studentEmail: z.string().email().nullable(),
  coachUserId: z.string().uuid().nullable(),
  coachName: z.string().nullable(),
  coachEmail: z.string().email().nullable(),
});
export type MessageStudentTarget = z.infer<typeof MessageStudentTargetSchema>;

export const MessageGroupTargetSchema = z.object({
  groupId: z.string().uuid(),
  groupName: z.string(),
  studentCount: z.number().int().nonnegative(),
  coachCount: z.number().int().nonnegative(),
});
export type MessageGroupTarget = z.infer<typeof MessageGroupTargetSchema>;

export const MessageContactsResponseSchema = z.object({
  coachContacts: z.array(MessageContactItemSchema),
  studentTargets: z.array(MessageStudentTargetSchema),
  groupTargets: z.array(MessageGroupTargetSchema),
  pendingIncomingCoachContactRequests: z.array(CoachContactRequestDtoSchema),
  pendingOutgoingCoachContactRequests: z.array(CoachContactRequestDtoSchema),
});
export type MessageContactsResponse = z.infer<typeof MessageContactsResponseSchema>;

export const MessageNotificationPreviewSchema = z.object({
  threadId: z.string().uuid(),
  kind: messageThreadKindSchema,
  fromName: z.string().nullable(),
  bodyPreview: z.string(),
  createdAt: z.string().min(1),
});
export type MessageNotificationPreview = z.infer<typeof MessageNotificationPreviewSchema>;

export const MessageNotificationsResponseSchema = z.object({
  unreadMessagesCount: z.number().int().nonnegative(),
  unreadPreviews: z.array(MessageNotificationPreviewSchema),
  pendingCoachContactRequestsCount: z.number().int().nonnegative(),
  pendingCoachContactRequests: z.array(CoachContactRequestDtoSchema),
});
export type MessageNotificationsResponse = z.infer<typeof MessageNotificationsResponseSchema>;

export const CreateMessageThreadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("student_coach"),
    studentId: z.string().uuid(),
    coachId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("coach_coach"),
    coachUserId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("group"),
    groupId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("group_info"),
    groupId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("org_info"),
  }),
  z.object({
    kind: z.literal("org_coaches"),
  }),
]);
export type CreateMessageThreadInput = z.infer<typeof CreateMessageThreadSchema>;

export const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const MarkThreadReadSchema = z.object({
  lastReadMessageId: z.number().int().positive(),
});
export type MarkThreadReadInput = z.infer<typeof MarkThreadReadSchema>;

export const CoachContactRequestCreateSchema = z.object({
  targetEmail: z.string().trim().toLowerCase().email(),
});
export type CoachContactRequestCreateInput = z.infer<typeof CoachContactRequestCreateSchema>;

export const CoachContactRequestRespondSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
});
export type CoachContactRequestRespondInput = z.infer<typeof CoachContactRequestRespondSchema>;

export const MessageThreadMessagesResponseSchema = z.object({
  threadId: z.string().uuid(),
  messages: z.array(MessageDtoSchema),
  nextCursor: z.number().int().positive().nullable(),
  ownLastReadMessageId: z.number().int().positive().nullable(),
  ownLastReadAt: z.string().nullable(),
  counterpartLastReadMessageId: z.number().int().positive().nullable(),
  counterpartLastReadAt: z.string().nullable(),
});
export type MessageThreadMessagesResponse = z.infer<typeof MessageThreadMessagesResponseSchema>;
