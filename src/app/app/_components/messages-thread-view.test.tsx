import { render, screen } from "@testing-library/react";
import MessagesThreadView from "./messages-thread-view";

describe("MessagesThreadView", () => {
  it("shows seen timestamp on the latest outgoing message", () => {
    render(
      <MessagesThreadView
        thread={{
          threadId: "11111111-1111-1111-1111-111111111111",
          kind: "coach_coach",
          workspaceOrgId: "org-1",
          studentId: null,
          studentName: null,
          groupId: null,
          groupName: null,
          participantAId: "u1",
          participantAName: "Moi",
          participantBId: "u2",
          participantBName: "Conversation",
          counterpartUserId: "u2",
          counterpartName: "Conversation",
          lastMessageId: 5,
          lastMessageAt: "2026-02-13T10:00:00.000Z",
          lastMessagePreview: "Message",
          lastMessageSenderUserId: "u1",
          unread: false,
          unreadCount: 0,
          ownLastReadMessageId: 5,
          ownLastReadAt: "2026-02-13T10:00:00.000Z",
          counterpartLastReadMessageId: 5,
          counterpartLastReadAt: "2026-02-13T10:01:00.000Z",
        }}
        messages={[
          {
            id: 5,
            threadId: "11111111-1111-1111-1111-111111111111",
            senderUserId: "u1",
            senderName: "Moi",
            senderAvatarUrl: null,
            senderRole: "coach",
            body: "Salut",
            createdAt: "2026-02-13T10:00:00.000Z",
          },
        ]}
        currentUserId="u1"
        loading={false}
        error=""
        nextCursor={null}
        onLoadOlder={async () => undefined}
        counterpartLastReadMessageId={5}
        counterpartLastReadAt="2026-02-13T10:01:00.000Z"
      />
    );

    expect(screen.getByText(/Vu a/i)).toBeInTheDocument();
  });

  it("shows sender label only once for consecutive messages from same sender", () => {
    render(
      <MessagesThreadView
        thread={{
          threadId: "11111111-1111-1111-1111-111111111111",
          kind: "coach_coach",
          workspaceOrgId: "org-1",
          studentId: null,
          studentName: null,
          groupId: null,
          groupName: null,
          participantAId: "u1",
          participantAName: "Moi",
          participantBId: "u2",
          participantBName: "Conversation",
          counterpartUserId: "u2",
          counterpartName: "Conversation",
          lastMessageId: 6,
          lastMessageAt: "2026-02-13T10:01:00.000Z",
          lastMessagePreview: "Re",
          lastMessageSenderUserId: "u2",
          unread: false,
          unreadCount: 0,
          ownLastReadMessageId: 6,
          ownLastReadAt: "2026-02-13T10:02:00.000Z",
          counterpartLastReadMessageId: 6,
          counterpartLastReadAt: "2026-02-13T10:02:00.000Z",
        }}
        messages={[
          {
            id: 5,
            threadId: "11111111-1111-1111-1111-111111111111",
            senderUserId: "u2",
            senderName: "Coach B",
            senderAvatarUrl: null,
            senderRole: "coach",
            body: "Salut",
            createdAt: "2026-02-13T10:00:00.000Z",
          },
          {
            id: 6,
            threadId: "11111111-1111-1111-1111-111111111111",
            senderUserId: "u2",
            senderName: "Coach B",
            senderAvatarUrl: null,
            senderRole: "coach",
            body: "Re",
            createdAt: "2026-02-13T10:01:00.000Z",
          },
        ]}
        currentUserId="u1"
        loading={false}
        error=""
        nextCursor={null}
        onLoadOlder={async () => undefined}
        counterpartLastReadMessageId={6}
        counterpartLastReadAt="2026-02-13T10:02:00.000Z"
      />
    );

    expect(screen.getAllByText("Coach B")).toHaveLength(1);
  });
});
