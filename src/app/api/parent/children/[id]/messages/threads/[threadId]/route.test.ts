import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/messages-access", () => ({
  loadParentLinkedStudentContext: jest.fn(),
}));

jest.mock("@/lib/messages/service", () => ({
  loadThreadMessages: jest.fn(),
  loadThreadMembersForThread: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const THREAD_ID = "22222222-2222-2222-2222-222222222222";

const buildRequest = () =>
  ({
    url:
      "https://example.com/api/parent/children/" +
      STUDENT_ID +
      "/messages/threads/" +
      THREAD_ID,
    headers: new Headers(),
  }) as Request;

const buildAdmin = (threadRow: Record<string, unknown> | null) => ({
  from: jest.fn((table: string) => {
    if (table !== "message_threads") return {};
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: threadRow, error: null }),
        }),
      }),
    };
  }),
});

describe("GET /api/parent/children/[id]/messages/threads/[threadId]", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/messages-access") as {
    loadParentLinkedStudentContext: jest.Mock;
  };
  const serviceMocks = jest.requireMock("@/lib/messages/service") as {
    loadThreadMessages: jest.Mock;
    loadThreadMembersForThread: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when thread belongs to another child", async () => {
    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: {
        admin: buildAdmin({
          id: THREAD_ID,
          kind: "student_coach",
          workspace_org_id: "33333333-3333-3333-3333-333333333333",
          student_id: "99999999-9999-9999-9999-999999999999",
          group_id: null,
          participant_a_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          participant_b_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        }),
        studentId: STUDENT_ID,
      },
      response: null,
    });

    const response = await GET(buildRequest(), {
      params: { id: STUDENT_ID, threadId: THREAD_ID },
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 when thread kind is not student_coach", async () => {
    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: {
        admin: buildAdmin({
          id: THREAD_ID,
          kind: "group",
          workspace_org_id: "33333333-3333-3333-3333-333333333333",
          student_id: STUDENT_ID,
          group_id: "44444444-4444-4444-4444-444444444444",
          participant_a_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          participant_b_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        }),
        studentId: STUDENT_ID,
      },
      response: null,
    });

    const response = await GET(buildRequest(), {
      params: { id: STUDENT_ID, threadId: THREAD_ID },
    });

    expect(response.status).toBe(403);
  });

  it("returns 200 for allowed student_coach thread", async () => {
    const threadRow = {
      id: THREAD_ID,
      kind: "student_coach",
      workspace_org_id: "33333333-3333-3333-3333-333333333333",
      student_id: STUDENT_ID,
      group_id: null,
      participant_a_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      participant_b_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    };

    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: {
        admin: buildAdmin(threadRow),
        studentId: STUDENT_ID,
      },
      response: null,
    });
    serviceMocks.loadThreadMessages.mockResolvedValue({
      rows: [
        {
          id: 10,
          threadId: THREAD_ID,
          senderUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          senderName: "Coach Demo",
          senderAvatarUrl: null,
          senderRole: "coach",
          body: "Bonjour",
          createdAt: "2026-02-17T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    serviceMocks.loadThreadMembersForThread.mockResolvedValue([
      {
        userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        fullName: "Leo Martin",
        avatarUrl: null,
        role: "student",
      },
      {
        userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        fullName: "Coach Demo",
        avatarUrl: null,
        role: "coach",
      },
    ]);

    const response = await GET(buildRequest(), {
      params: { id: STUDENT_ID, threadId: THREAD_ID },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.threadId).toBe(THREAD_ID);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].body).toBe("Bonjour");
  });
});

