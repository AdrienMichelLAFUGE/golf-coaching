import { messagesJson } from "@/lib/messages/http";
import { loadMessageActorContext } from "@/lib/messages/access";
import {
  loadInbox,
  loadThreadMessages,
  validateThreadAccess,
} from "@/lib/messages/service";
import { MessageExportResponseSchema } from "@/lib/messages/types";

const MAX_THREADS = 50;
const MAX_MESSAGES_PER_THREAD = 2_000;
const PAGE_SIZE = 200;

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request, {
    skipCharterCheck: true,
    skipSuspensionCheck: true,
  });
  if (response || !context) return response;

  const inbox = await loadInbox(context.admin, context.userId, context.profile.role);
  const selectedThreads = inbox.threads.slice(0, MAX_THREADS);
  let truncated = inbox.threads.length > MAX_THREADS;

  const exportedThreads = [] as Array<{
    summary: (typeof inbox.threads)[number];
    messages: Awaited<ReturnType<typeof loadThreadMessages>>["rows"];
  }>;

  for (const thread of selectedThreads) {
    const access = await validateThreadAccess(
      context.admin,
      context.userId,
      context.profile.role,
      thread.threadId,
      "read"
    );

    if (!access.ok) {
      continue;
    }

    let cursor: number | null = null;
    const messages = [] as Awaited<ReturnType<typeof loadThreadMessages>>["rows"];

    while (true) {
      const { rows, nextCursor } = await loadThreadMessages(
        context.admin,
        thread.threadId,
        cursor,
        PAGE_SIZE
      );

      if (rows.length === 0) {
        break;
      }

      messages.push(...rows);
      if (messages.length >= MAX_MESSAGES_PER_THREAD) {
        truncated = true;
        messages.splice(MAX_MESSAGES_PER_THREAD);
        break;
      }

      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    exportedThreads.push({
      summary: thread,
      messages,
    });
  }

  const payload = MessageExportResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    userId: context.userId,
    workspaceOrgId: context.activeWorkspace.id,
    truncated,
    threads: exportedThreads,
  });

  return messagesJson(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="messages-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
