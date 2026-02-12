import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClientFromRequest } from "@/lib/supabase/server";

type ShareRow = {
  id: string;
  source_report_id: string;
  created_at: string;
  payload: {
    report_title?: string | null;
    sender_name?: string | null;
    source_student_name?: string | null;
  } | null;
};

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role === "student") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: rows, error: rowsError } = await admin
    .from("report_shares")
    .select("id, source_report_id, created_at, payload")
    .eq("recipient_user_id", profile.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 400 });
  }

  const shares = ((rows ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    source_report_id: row.source_report_id,
    created_at: row.created_at,
    report_title: row.payload?.report_title?.trim() || "Rapport partage",
    sender_name: row.payload?.sender_name?.trim() || "Coach SwingFlow",
    source_student_name: row.payload?.source_student_name?.trim() || null,
  }));

  return NextResponse.json({ shares });
}
