import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity-log";
import { loadParentInvitationActor } from "@/lib/parent/invitation-access";
import { regenerateStudentParentSecretCode } from "@/lib/parent/student-secret-code-service";
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

export async function POST(request: Request, { params }: Params) {
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
  const access = await loadParentInvitationActor(
    admin,
    userData.user.id,
    parsedParams.data.studentId
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const secret = await regenerateStudentParentSecretCode(
    admin,
    parsedParams.data.studentId
  );
  if (!secret) {
    return NextResponse.json(
      { error: "Regeneration du code parent impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "parent.secret_code.regenerated",
    actorUserId: userData.user.id,
    entityType: "student",
    entityId: parsedParams.data.studentId,
    message: "Code secret parent regenere (one-shot).",
    metadata: {
      studentId: parsedParams.data.studentId,
      actorRole: access.actorRole,
      rotatedAt: secret.rotatedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    oneShot: true,
    secretCode: secret.secretCode,
    rotatedAt: secret.rotatedAt,
  });
}
