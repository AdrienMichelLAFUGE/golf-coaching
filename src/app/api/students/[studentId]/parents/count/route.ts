import { NextResponse } from "next/server";
import { z } from "zod";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError } from "@/lib/validation";

type Params = {
  params: { studentId: string } | Promise<{ studentId: string }>;
};

const paramsSchema = z.object({
  studentId: z.string().uuid(),
});

export async function GET(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const canAccess = await canCoachLikeAccessStudent(
    admin,
    userData.user.id,
    parsedParams.data.studentId
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { count, error } = await admin
    .from("parent_child_links")
    .select("id", { count: "exact", head: true })
    .eq("student_id", parsedParams.data.studentId);

  if (error) {
    return NextResponse.json(
      { error: "Chargement impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ count: count ?? 0 });
}
