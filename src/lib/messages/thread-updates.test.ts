import type { MessageDto } from "@/lib/messages/types";
import {
  appendRealtimeMessage,
  mergeServerMessageWithOptimistic,
} from "@/lib/messages/thread-updates";

const buildMessage = (id: number, overrides?: Partial<MessageDto>): MessageDto => ({
  id,
  threadId: "11111111-1111-1111-1111-111111111111",
  senderUserId: "22222222-2222-2222-2222-222222222222",
  senderName: "Coach Test",
  senderAvatarUrl: null,
  senderRole: "coach",
  body: `message-${id}`,
  createdAt: "2026-02-14T00:00:00.000Z",
  ...overrides,
});

describe("messages thread updates", () => {
  it("replaces optimistic message with server message and deduplicates by id", () => {
    const optimistic = buildMessage(9_999_999, { body: "optimistic" });
    const existing = buildMessage(10, { body: "existing" });
    const server = buildMessage(11, { body: "server" });

    const merged = mergeServerMessageWithOptimistic(
      [existing, optimistic, buildMessage(11, { body: "old-server-copy" })],
      optimistic.id,
      server
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe(10);
    expect(merged[1]?.id).toBe(11);
    expect(merged[1]?.body).toBe("server");
  });

  it("appends realtime message once and keeps order by id", () => {
    const first = buildMessage(2);
    const second = buildMessage(4);
    const realtime = buildMessage(3, { body: "realtime" });

    const withRealtime = appendRealtimeMessage([first, second], realtime);
    expect(withRealtime.map((message) => message.id)).toEqual([2, 3, 4]);

    const deduped = appendRealtimeMessage(withRealtime, realtime);
    expect(deduped.map((message) => message.id)).toEqual([2, 3, 4]);
  });
});
