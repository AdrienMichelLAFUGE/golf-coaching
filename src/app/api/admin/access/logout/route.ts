import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createBackofficeLogoutResponse } from "@/lib/backoffice-auth";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  return createBackofficeLogoutResponse();
}

