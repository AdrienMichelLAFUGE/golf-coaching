import { NextResponse } from "next/server";
import { z } from "zod";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";
import { normalizeParentLinkPermissions } from "@/lib/parent/permissions";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError } from "@/lib/validation";

type Params = {
  params: { studentId: string } | Promise<{ studentId: string }>;
};

type ParentLinkRow = {
  parent_user_id: string;
  parent_email: string | null;
  created_at: string;
  permissions: unknown;
  profiles:
    | {
        full_name: string | null;
      }
    | {
        full_name: string | null;
      }[]
    | null;
};

const paramsSchema = z.object({
  studentId: z.string().uuid(),
});

const resolveProfile = (value: ParentLinkRow["profiles"]) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

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

  const { data, error } = await admin
    .from("parent_child_links")
    .select(
      "parent_user_id, parent_email, created_at, permissions, profiles:parent_user_id(full_name)"
    )
    .eq("student_id", parsedParams.data.studentId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Chargement des parents impossible." },
      { status: 400 }
    );
  }

  const parents = ((data ?? []) as ParentLinkRow[]).map((row) => {
    const profile = resolveProfile(row.profiles);
    return {
      parentUserId: row.parent_user_id,
      parentEmail: row.parent_email,
      parentName: profile?.full_name ?? null,
      createdAt: row.created_at,
      permissions: normalizeParentLinkPermissions(row.permissions),
    };
  });

  return NextResponse.json({ parents });
}

