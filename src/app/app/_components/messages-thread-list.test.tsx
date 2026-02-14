import { render, screen } from "@testing-library/react";
import MessagesThreadList from "./messages-thread-list";

describe("MessagesThreadList", () => {
  it("shows unread badge count", () => {
    render(
      <MessagesThreadList
        threads={[
          {
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
            participantBName: "Coach B",
            counterpartUserId: "u2",
            counterpartName: "Coach B",
            lastMessageId: 5,
            lastMessageAt: "2026-02-13T10:00:00.000Z",
            lastMessagePreview: "Message",
            lastMessageSenderUserId: "u2",
            unread: true,
            unreadCount: 3,
            ownLastReadMessageId: 2,
            ownLastReadAt: "2026-02-13T09:00:00.000Z",
            counterpartLastReadMessageId: 5,
            counterpartLastReadAt: "2026-02-13T10:01:00.000Z",
            frozenAt: null,
            frozenByUserId: null,
            frozenReason: null,
          },
        ]}
        selectedThreadId={null}
        loading={false}
        error=""
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
