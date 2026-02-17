import "server-only";

import { messagesJson } from "@/lib/messages/http";
import { loadParentLinkedStudentContext as loadParentLinkedStudentBaseContext } from "@/lib/parent/access";

export type ParentLinkedStudentContext = {
  admin: ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;
  parentUserId: string;
  studentId: string;
  studentName: string | null;
  studentUserId: string | null;
};

export const loadParentLinkedStudentContext = async (
  request: Request,
  studentId: string
): Promise<
  | {
      context: ParentLinkedStudentContext;
      response: null;
    }
  | {
      context: null;
      response: Response;
    }
> => {
  const loaded = await loadParentLinkedStudentBaseContext(request, studentId);
  if (!loaded.context) {
    return {
      context: null,
      response: messagesJson(
        { error: loaded.failure?.error ?? "Acces refuse." },
        { status: loaded.failure?.status ?? 403 }
      ),
    };
  }

  const { data: studentAccountData } = await loaded.context.admin
    .from("student_accounts")
    .select("user_id")
    .eq("student_id", loaded.context.studentId)
    .maybeSingle();

  const studentName = `${loaded.context.studentFirstName} ${loaded.context.studentLastName ?? ""}`.trim();

  return {
    context: {
      admin: loaded.context.admin,
      parentUserId: loaded.context.parentUserId,
      studentId: loaded.context.studentId,
      studentName,
      studentUserId:
        ((studentAccountData as { user_id: string } | null)?.user_id ?? null),
    },
    response: null,
  };
};
