import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity-log";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";
import {
  type ParentLinkPermissions,
  normalizeParentLinkPermissions,
} from "@/lib/parent/permissions";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type Params = {
  params:
    | { studentId: string; parentUserId: string }
    | Promise<{ studentId: string; parentUserId: string }>;
};

type ParentLinkRow = {
  id: string;
  permissions: unknown;
};

const paramsSchema = z.object({
  studentId: z.string().uuid(),
  parentUserId: z.string().uuid(),
});

const permissionsPatchSchema = z.object({
  permissions: z
    .object({
      dashboard: z.boolean().optional(),
      rapports: z.boolean().optional(),
      tests: z.boolean().optional(),
      calendrier: z.boolean().optional(),
      messages: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "Au moins un module doit etre fourni.",
    }),
});

const mergePermissions = (
  current: ParentLinkPermissions,
  patch: z.infer<typeof permissionsPatchSchema>["permissions"]
): ParentLinkPermissions => ({
  dashboard: patch.dashboard ?? current.dashboard,
  rapports: patch.rapports ?? current.rapports,
  tests: patch.tests ?? current.tests,
  calendrier: patch.calendrier ?? current.calendrier,
  messages: patch.messages ?? current.messages,
});

export async function PATCH(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const parsedBody = await parseRequestJson(request, permissionsPatchSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
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

  const { data: linkData, error: linkError } = await admin
    .from("parent_child_links")
    .select("id, permissions")
    .eq("student_id", parsedParams.data.studentId)
    .eq("parent_user_id", parsedParams.data.parentUserId)
    .eq("status", "active")
    .maybeSingle();

  const link = (linkData as ParentLinkRow | null) ?? null;
  if (linkError || !link) {
    return NextResponse.json(
      { error: "Lien parent introuvable." },
      { status: 404 }
    );
  }

  const nextPermissions = mergePermissions(
    normalizeParentLinkPermissions(link.permissions),
    parsedBody.data.permissions
  );

  const { error: updateError } = await admin
    .from("parent_child_links")
    .update({ permissions: nextPermissions })
    .eq("id", link.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Mise a jour des permissions impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "parent.child_link.permissions.updated",
    actorUserId: userData.user.id,
    entityType: "student",
    entityId: parsedParams.data.studentId,
    message: "Permissions parent mises a jour.",
    metadata: {
      studentId: parsedParams.data.studentId,
      parentUserId: parsedParams.data.parentUserId,
      permissions: nextPermissions,
    },
  });

  return NextResponse.json({
    ok: true,
    permissions: nextPermissions,
  });
}

