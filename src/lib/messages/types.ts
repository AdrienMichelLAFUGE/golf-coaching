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
  senderRole: z.enum(["owner", "coach", "staff", "student", "parent"]).nullable(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().min(1),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const MessageThreadMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(["owner", "coach", "staff", "student", "parent"]).nullable(),
});
export type MessageThreadMember = z.infer<typeof MessageThreadMemberSchema>;

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
  frozenAt: z.string().nullable(),
  frozenByUserId: z.string().uuid().nullable(),
  frozenReason: z.string().nullable(),
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
  role: z.enum(["owner", "coach", "staff", "student", "parent"]),
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
  pendingModerationReportsCount: z.number().int().nonnegative().default(0),
});
export type MessageNotificationsResponse = z.infer<typeof MessageNotificationsResponseSchema>;

export const MessagingGuardModeSchema = z.enum(["flag", "block"]);
export type MessagingGuardMode = z.infer<typeof MessagingGuardModeSchema>;

export const MessagingPolicySchema = z.object({
  orgId: z.string().uuid(),
  guardMode: MessagingGuardModeSchema,
  sensitiveWords: z.array(z.string().min(1)).default([]),
  retentionDays: z.number().int().min(30).max(3650),
  charterVersion: z.number().int().min(1),
  supervisionEnabled: z.boolean(),
});
export type MessagingPolicy = z.infer<typeof MessagingPolicySchema>;

export const UpdateMessagingPolicySchema = z.object({
  guardMode: MessagingGuardModeSchema.optional(),
  sensitiveWords: z.array(z.string().trim().min(1).max(64)).max(200).optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
  charterVersion: z.number().int().min(1).optional(),
  supervisionEnabled: z.boolean().optional(),
});
export type UpdateMessagingPolicyInput = z.infer<typeof UpdateMessagingPolicySchema>;

export const MessagingCharterStatusSchema = z.object({
  charterVersion: z.number().int().min(1),
  mustAccept: z.boolean(),
  acceptedAt: z.string().nullable(),
  content: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    orgNamePlaceholder: z.string().min(1),
    supportEmailPlaceholder: z.string().min(1),
  }),
});
export type MessagingCharterStatus = z.infer<typeof MessagingCharterStatusSchema>;

export const AcceptMessagingCharterSchema = z.object({
  charterVersion: z.number().int().min(1),
});
export type AcceptMessagingCharterInput = z.infer<typeof AcceptMessagingCharterSchema>;

export const MessageReportStatusSchema = z.enum(["open", "in_review", "resolved"]);
export type MessageReportStatus = z.infer<typeof MessageReportStatusSchema>;

export const CreateMessageReportSchema = z.object({
  threadId: z.string().uuid(),
  messageId: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(200),
  details: z.string().trim().max(1000).optional(),
});
export type CreateMessageReportInput = z.infer<typeof CreateMessageReportSchema>;

export const UpdateMessageReportSchema = z.object({
  status: MessageReportStatusSchema,
  freezeThread: z.boolean().optional(),
  resolutionNote: z.string().trim().max(1000).optional(),
});
export type UpdateMessageReportInput = z.infer<typeof UpdateMessageReportSchema>;

export const MessageReportDtoSchema = z.object({
  id: z.string().uuid(),
  workspaceOrgId: z.string().uuid(),
  threadId: z.string().uuid(),
  messageId: z.number().int().positive().nullable(),
  reportedBy: z.string().uuid().nullable(),
  reportedByName: z.string().nullable(),
  reason: z.string().min(1),
  details: z.string().nullable(),
  status: MessageReportStatusSchema,
  freezeApplied: z.boolean(),
  frozenAt: z.string().nullable(),
  frozenReason: z.string().nullable(),
  resolvedBy: z.string().uuid().nullable(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type MessageReportDto = z.infer<typeof MessageReportDtoSchema>;

export const MessageReportSnapshotItemSchema = z.object({
  id: z.number().int().positive(),
  senderUserId: z.string().uuid(),
  senderName: z.string().nullable(),
  senderRole: z.enum(["owner", "coach", "staff", "student", "parent"]).nullable(),
  createdAt: z.string().min(1),
  body: z.string().min(1),
});
export type MessageReportSnapshotItem = z.infer<typeof MessageReportSnapshotItemSchema>;

export const MessageReportsResponseSchema = z.object({
  reports: z.array(MessageReportDtoSchema),
});
export type MessageReportsResponse = z.infer<typeof MessageReportsResponseSchema>;

export const MessageReportThreadMessagesResponseSchema = z.object({
  report: MessageReportDtoSchema,
  snapshot: z.array(MessageReportSnapshotItemSchema),
  messages: z.array(MessageDtoSchema),
  threadMembers: z.array(MessageThreadMemberSchema),
});
export type MessageReportThreadMessagesResponse = z.infer<
  typeof MessageReportThreadMessagesResponseSchema
>;

export const MessageSuspensionDtoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().nullable(),
  userRole: z.enum(["owner", "coach", "staff", "student", "parent"]).nullable(),
  reason: z.string().min(1),
  suspendedUntil: z.string().nullable(),
  createdAt: z.string().min(1),
  createdBy: z.string().uuid().nullable(),
  createdByName: z.string().nullable(),
});
export type MessageSuspensionDto = z.infer<typeof MessageSuspensionDtoSchema>;

export const MessageSuspensionsResponseSchema = z.object({
  suspensions: z.array(MessageSuspensionDtoSchema),
});
export type MessageSuspensionsResponse = z.infer<
  typeof MessageSuspensionsResponseSchema
>;

export const ManageMessageSuspensionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    userId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    suspendedUntil: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("lift"),
    userId: z.string().uuid(),
  }),
]);
export type ManageMessageSuspensionInput = z.infer<
  typeof ManageMessageSuspensionSchema
>;

export const MessageThreadExportSchema = z.object({
  summary: MessageThreadSummarySchema,
  messages: z.array(MessageDtoSchema),
});
export type MessageThreadExport = z.infer<typeof MessageThreadExportSchema>;

export const MessageExportResponseSchema = z.object({
  generatedAt: z.string().min(1),
  userId: z.string().uuid(),
  workspaceOrgId: z.string().uuid(),
  truncated: z.boolean(),
  threads: z.array(MessageThreadExportSchema),
});
export type MessageExportResponse = z.infer<typeof MessageExportResponseSchema>;

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
  threadMembers: z.array(MessageThreadMemberSchema),
  nextCursor: z.number().int().positive().nullable(),
  ownLastReadMessageId: z.number().int().positive().nullable(),
  ownLastReadAt: z.string().nullable(),
  counterpartLastReadMessageId: z.number().int().positive().nullable(),
  counterpartLastReadAt: z.string().nullable(),
});
export type MessageThreadMessagesResponse = z.infer<typeof MessageThreadMessagesResponseSchema>;
