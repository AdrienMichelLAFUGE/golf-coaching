import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

const requireAdmin = async (request: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return {
      error: NextResponse.json(
        { error: "Missing Supabase env vars." },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createClient(supabaseUrl, serviceRoleKey),
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
    auth.admin.from("profiles").select("id", {
      count: "exact",
      head: true,
    }).neq("role", "student"),
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
