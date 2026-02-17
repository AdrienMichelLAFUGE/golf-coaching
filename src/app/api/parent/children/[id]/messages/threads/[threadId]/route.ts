import { z } from "zod";
import { messagesJson } from "@/lib/messages/http";
import {
  MessageThreadMessagesResponseSchema,
  type MessageThreadKind,
} from "@/lib/messages/types";
import {
  loadThreadMembersForThread,
  loadThreadMessages,
} from "@/lib/messages/service";
import { loadParentLinkedStudentContext } from "@/lib/parent/messages-access";

type Params = {
  params:
    | { id: string; threadId: string }
    | Promise<{ id: string; threadId: string }>;
};

type ThreadRow = {
  id: string;
  kind: MessageThreadKind;
  workspace_org_id: string;
  student_id: string | null;
  group_id: string | null;
  participant_a_id: string;
  participant_b_id: string;
};

const paramsSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
});

const querySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const resolveParams = async (params: Params["params"]) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return null;
  return parsed.data;
};

export async function GET(request: Request, { params }: Params) {
  const parsedParams = await resolveParams(params);
  if (!parsedParams) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const query = new URL(request.url).searchParams;
  const parsedQuery = querySchema.safeParse({
    cursor: query.get("cursor") ?? undefined,
    limit: query.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const { context, response } = await loadParentLinkedStudentContext(
    request,
    parsedParams.id
  );
  if (response || !context) return response;

  const { data: threadData, error: threadError } = await context.admin
    .from("message_threads")
    .select(
      "id, kind, workspace_org_id, student_id, group_id, participant_a_id, participant_b_id"
    )
    .eq("id", parsedParams.threadId)
    .maybeSingle();

  if (
    threadError ||
    !threadData ||
    (threadData as ThreadRow).kind !== "student_coach" ||
    (threadData as ThreadRow).student_id !== context.studentId
  ) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const thread = threadData as ThreadRow;

  const { rows, nextCursor } = await loadThreadMessages(
    context.admin,
    thread.id,
    parsedQuery.data.cursor ?? null,
    parsedQuery.data.limit ?? 50
  );

  const threadMembers = await loadThreadMembersForThread(context.admin, thread);

  const parsedResponse = MessageThreadMessagesResponseSchema.safeParse({
    threadId: thread.id,
    messages: rows,
    threadMembers,
    nextCursor,
    ownLastReadMessageId: null,
    ownLastReadAt: null,
    counterpartLastReadMessageId: null,
    counterpartLastReadAt: null,
  });

  if (!parsedResponse.success) {
    return messagesJson({ error: "Reponse messagerie invalide." }, { status: 500 });
  }

  return messagesJson(parsedResponse.data);
}

