import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import {
  createBackofficeLoginResponse,
  getBackofficeProtectionState,
  verifyBackofficeCredentials,
} from "@/lib/backoffice-auth";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const parsed = await parseRequestJson(request, loginSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const state = getBackofficeProtectionState(request);
  if (!state.enabled) {
    return NextResponse.json(
      { error: "Verrou backoffice desactive." },
      { status: 409 }
    );
  }

  if (state.misconfigured) {
    return NextResponse.json(
      {
        error:
          state.reason ??
          "Backoffice verrouille: configuration de securite invalide.",
        code: "BACKOFFICE_LOCK_MISCONFIGURED",
      },
      { status: 500 }
    );
  }

  const { identifier, password } = parsed.data;
  if (!verifyBackofficeCredentials(identifier, password)) {
    return NextResponse.json(
      { error: "Identifiant ou mot de passe invalide." },
      { status: 401 }
    );
  }

  return createBackofficeLoginResponse(identifier);
}

