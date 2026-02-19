import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity-log";
import { loadParentInvitationActor } from "@/lib/parent/invitation-access";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError } from "@/lib/validation";

type Params = {
  params:
    | { studentId: string; invitationId: string }
    | Promise<{ studentId: string; invitationId: string }>;
};

const paramsSchema = z.object({
  studentId: z.string().uuid(),
  invitationId: z.string().uuid(),
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
  const access = await loadParentInvitationActor(
    admin,
    userData.user.id,
    parsedParams.data.studentId
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("parent_child_link_invitations")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: userData.user.id,
    })
    .eq("id", parsedParams.data.invitationId)
    .eq("student_id", parsedParams.data.studentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Revocation invitation impossible." },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Invitation introuvable ou deja traitee." },
      { status: 404 }
    );
  }

  await recordActivity({
    admin,
    action: "parent.invitation.revoked",
    actorUserId: userData.user.id,
    entityType: "student",
    entityId: parsedParams.data.studentId,
    message: "Invitation parent revoquee.",
    metadata: {
      actorRole: access.actorRole,
      invitationId: parsedParams.data.invitationId,
    },
  });

  return NextResponse.json({ ok: true });
}
