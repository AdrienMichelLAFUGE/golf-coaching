import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/messages/access", () => ({
  loadMessageActorContext: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  loadInbox: jest.fn(),
  loadThreadMessages: jest.fn(),
  validateThreadAccess: jest.fn(),
}));

describe("GET /api/messages/export", () => {
  const accessMocks = jest.requireMock("@/lib/messages/access") as {
    loadMessageActorContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    loadInbox: jest.Mock;
    loadThreadMessages: jest.Mock;
    validateThreadAccess: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports accessible threads/messages as JSON payload", async () => {
    accessMocks.loadMessageActorContext.mockResolvedValue({
      context: {
        userId: "11111111-1111-1111-1111-111111111111",
        profile: { role: "coach" },
        activeWorkspace: { id: "22222222-2222-2222-2222-222222222222" },
        admin: {},
      },
      response: null,
    });

    serviceMocks.loadInbox.mockResolvedValue({
      unreadMessagesCount: 1,
      threads: [
        {
          threadId: "33333333-3333-3333-3333-333333333333",
          kind: "coach_coach",
          workspaceOrgId: "22222222-2222-2222-2222-222222222222",
          studentId: null,
          studentName: null,
          groupId: null,
          groupName: null,
          participantAId: "11111111-1111-1111-1111-111111111111",
          participantAName: "Coach A",
          participantBId: "44444444-4444-4444-4444-444444444444",
          participantBName: "Coach B",
          counterpartUserId: "44444444-4444-4444-4444-444444444444",
          counterpartName: "Coach B",
          lastMessageId: 10,
          lastMessageAt: "2026-01-01T10:00:00.000Z",
          lastMessagePreview: "Bonjour",
          lastMessageSenderUserId: "44444444-4444-4444-4444-444444444444",
          unread: true,
          unreadCount: 1,
          ownLastReadMessageId: 9,
          ownLastReadAt: "2026-01-01T09:00:00.000Z",
          counterpartLastReadMessageId: 10,
          counterpartLastReadAt: "2026-01-01T10:00:00.000Z",
          frozenAt: null,
          frozenByUserId: null,
          frozenReason: null,
        },
      ],
    });

    serviceMocks.validateThreadAccess.mockResolvedValue({ ok: true });
    serviceMocks.loadThreadMessages.mockResolvedValue({
      rows: [
        {
          id: 10,
          threadId: "33333333-3333-3333-3333-333333333333",
          senderUserId: "44444444-4444-4444-4444-444444444444",
          senderName: "Coach B",
          senderAvatarUrl: null,
          senderRole: "coach",
          body: "Bonjour",
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });

    const response = await GET({} as Request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workspaceOrgId).toBe("22222222-2222-2222-2222-222222222222");
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].messages).toHaveLength(1);
  });
});
