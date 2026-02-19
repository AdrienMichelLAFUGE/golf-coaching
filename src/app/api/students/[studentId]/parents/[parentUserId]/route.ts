import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity-log";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError } from "@/lib/validation";

type Params = {
  params:
    | { studentId: string; parentUserId: string }
    | Promise<{ studentId: string; parentUserId: string }>;
};

const paramsSchema = z.object({
  studentId: z.string().uuid(),
  parentUserId: z.string().uuid(),
});

export async function DELETE(request: Request, { params }: Params) {
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

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("parent_child_links")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: userData.user.id,
    })
    .eq("student_id", parsedParams.data.studentId)
    .eq("parent_user_id", parsedParams.data.parentUserId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Dissociation parent impossible." },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Lien parent introuvable." },
      { status: 404 }
    );
  }

  await recordActivity({
    admin,
    action: "parent.child_link.revoked_by_coach",
    actorUserId: userData.user.id,
    entityType: "student",
    entityId: parsedParams.data.studentId,
    message: "Dissociation parent effectuee depuis la fiche eleve.",
    metadata: {
      studentId: parsedParams.data.studentId,
      parentUserId: parsedParams.data.parentUserId,
    },
  });

  return NextResponse.json({ ok: true });
}

