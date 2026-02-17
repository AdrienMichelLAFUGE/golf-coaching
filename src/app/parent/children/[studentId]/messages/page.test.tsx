import { render, screen } from "@testing-library/react";
import ParentChildMessagesPage from "./page";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "token-parent" } },
      })),
    },
  },
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const THREAD_ID = "22222222-2222-2222-2222-222222222222";

const inboxPayload = {
  threads: [
    {
      threadId: THREAD_ID,
      kind: "student_coach",
      workspaceOrgId: "33333333-3333-3333-3333-333333333333",
      studentId: STUDENT_ID,
      studentName: "Leo Martin",
      groupId: null,
      groupName: null,
      participantAId: "44444444-4444-4444-4444-444444444444",
      participantAName: "Leo Martin",
      participantBId: "55555555-5555-5555-5555-555555555555",
      participantBName: "Coach Demo",
      counterpartUserId: "55555555-5555-5555-5555-555555555555",
      counterpartName: "Coach Demo",
      lastMessageId: 10,
      lastMessageAt: "2026-02-17T10:00:00.000Z",
      lastMessagePreview: "Bonjour Leo",
      lastMessageSenderUserId: "55555555-5555-5555-5555-555555555555",
      unread: false,
      unreadCount: 0,
      ownLastReadMessageId: null,
      ownLastReadAt: null,
      counterpartLastReadMessageId: null,
      counterpartLastReadAt: null,
      frozenAt: null,
      frozenByUserId: null,
      frozenReason: null,
    },
  ],
  unreadMessagesCount: 0,
};

const threadPayload = {
  threadId: THREAD_ID,
  messages: [
    {
      id: 10,
      threadId: THREAD_ID,
      senderUserId: "55555555-5555-5555-5555-555555555555",
      senderName: "Coach Demo",
      senderAvatarUrl: null,
      senderRole: "coach",
      body: "Bonjour Leo",
      createdAt: "2026-02-17T10:00:00.000Z",
    },
  ],
  threadMembers: [
    {
      userId: "44444444-4444-4444-4444-444444444444",
      fullName: "Leo Martin",
      avatarUrl: null,
      role: "student",
    },
    {
      userId: "55555555-5555-5555-5555-555555555555",
      fullName: "Coach Demo",
      avatarUrl: null,
      role: "coach",
    },
  ],
  nextCursor: null,
  ownLastReadMessageId: null,
  ownLastReadAt: null,
  counterpartLastReadMessageId: null,
  counterpartLastReadAt: null,
};

describe("/parent/children/[studentId]/messages", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/messages/inbox")) {
        return Response.json(inboxPayload, { status: 200 });
      }
      if (url.includes("/messages/threads/")) {
        return Response.json(threadPayload, { status: 200 });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows read-only badge and keeps compose disabled for parent", async () => {
    const ui = await ParentChildMessagesPage({
      params: { studentId: STUDENT_ID },
    });
    render(ui);

    await screen.findByText("Coach Demo");
    expect(screen.getAllByText("Lecture seule (parent)").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /Nouvelle conversation/i })
    ).not.toBeInTheDocument();

    const disabledCompose = await screen.findByRole("button", {
      name: /Envoi des messages indisponible pour les parents/i,
    });
    expect(disabledCompose).toBeDisabled();
  });
});
