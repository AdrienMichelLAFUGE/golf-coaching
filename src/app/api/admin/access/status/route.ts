import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getBackofficeProtectionState } from "@/lib/backoffice-auth";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const state = getBackofficeProtectionState(request);
  if (state.misconfigured) {
    return NextResponse.json(
      {
        enabled: state.enabled,
        unlocked: false,
        username: null,
        error:
          state.reason ??
          "Backoffice verrouille: configuration de securite invalide.",
        code: "BACKOFFICE_LOCK_MISCONFIGURED",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    enabled: state.enabled,
    unlocked: state.unlocked,
    username: state.username,
  });
}

