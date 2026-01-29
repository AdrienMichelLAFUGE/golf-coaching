import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createSupabaseAdminClient(),
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: orgsCount, error: orgError },
    { count: coachesCount, error: coachError },
    { count: studentsCount, error: studentError },
    { count: aiCount, error: aiError },
  ] = await Promise.all([
    auth.admin.from("organizations").select("id", {
      count: "exact",
      head: true,
    }),
    auth.admin
      .from("profiles")
      .select("id", {
        count: "exact",
        head: true,
      })
      .neq("role", "student"),
    auth.admin.from("students").select("id", {
      count: "exact",
      head: true,
    }),
    auth.admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);

  if (orgError || coachError || studentError || aiError) {
    return NextResponse.json(
      {
        error:
          orgError?.message ||
          coachError?.message ||
          studentError?.message ||
          aiError?.message ||
          "Erreur inconnue.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orgsCount: orgsCount ?? 0,
    coachesCount: coachesCount ?? 0,
    studentsCount: studentsCount ?? 0,
    aiRequests30d: aiCount ?? 0,
  });
}
