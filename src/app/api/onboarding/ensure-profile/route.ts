import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity-log";

type StudentRow = {
  id: string;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  created_at?: string | null;
};

type ReportShareClaimRow = {
  id: string;
  source_report_id: string;
  status: "pending" | "emailed";
  created_at: string;
};

const ensurePersonalWorkspace = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  name?: string | null
) => {
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("workspace_type", "personal")
    .eq("owner_profile_id", userId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: personalOrg } = await admin
    .from("organizations")
    .insert([
      {
        name: name?.trim() || "Espace personnel",
        workspace_type: "personal",
        owner_profile_id: userId,
      },
    ])
    .select("id")
    .single();

  if (personalOrg?.id) {
    await admin.from("org_memberships").insert([
      {
        org_id: personalOrg.id,
        user_id: userId,
        role: "admin",
        status: "active",
        premium_active: true,
      },
    ]);
  }

  return personalOrg?.id ?? null;
};

const ensureOrgMembership = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  userId: string,
  role: "admin" | "coach"
) => {
  const { data: org } = await admin
    .from("organizations")
    .select("workspace_type")
    .eq("id", orgId)
    .maybeSingle();
  if (org?.workspace_type !== "org") return;

  const { data: existing } = await admin
    .from("org_memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.id) return;

  await admin.from("org_memberships").insert([
    {
      org_id: orgId,
      user_id: userId,
      role,
      status: "active",
      premium_active: role === "admin",
    },
  ]);
};

const loadStudentsByEmail = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
) => {
  const { data } = await admin
    .from("students")
    .select("id, org_id, first_name, last_name, created_at")
    .ilike("email", email)
    .order("created_at", { ascending: false });

  return (data ?? []) as StudentRow[];
};

const linkStudentAccounts = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  students: StudentRow[]
) => {
  if (students.length === 0) return;

  const payload = students.map((student) => ({
    student_id: student.id,
    user_id: userId,
  }));

  await admin.from("student_accounts").upsert(payload, { onConflict: "student_id" });
};

const claimEmailedReportShares = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    email: string;
    userId: string;
    targetOrgId: string;
  }
) => {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) return;

  const { data: shareRows, error: shareRowsError } = await admin
    .from("report_shares")
    .select("id, source_report_id, status, created_at")
    .eq("recipient_email", normalizedEmail)
    .in("status", ["pending", "emailed"])
    .order("created_at", { ascending: false });

  if (shareRowsError) {
    console.error("[onboarding] report_shares lookup failed:", shareRowsError.message);
    return;
  }

  const rows = (shareRows ?? []) as ReportShareClaimRow[];
  if (rows.length === 0) return;

  const pendingSourceIds = new Set(
    rows.filter((row) => row.status === "pending").map((row) => row.source_report_id)
  );

  const promoteIds: string[] = [];
  const rejectIds: string[] = [];
  const promotedSourceIds = new Set<string>();

  rows.forEach((row) => {
    if (row.status !== "emailed") return;
    if (pendingSourceIds.has(row.source_report_id)) {
      rejectIds.push(row.id);
      return;
    }
    if (promotedSourceIds.has(row.source_report_id)) {
      rejectIds.push(row.id);
      return;
    }
    promoteIds.push(row.id);
    promotedSourceIds.add(row.source_report_id);
  });

  if (promoteIds.length > 0) {
    const { error: promoteError } = await admin
      .from("report_shares")
      .update({
        recipient_user_id: input.userId,
        recipient_org_id: input.targetOrgId,
        status: "pending",
        delivery: "in_app",
        decided_at: null,
      })
      .in("id", promoteIds);
    if (promoteError) {
      console.error("[onboarding] report_shares claim failed:", promoteError.message);
    }
  }

  if (rejectIds.length > 0) {
    const { error: rejectError } = await admin
      .from("report_shares")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
      })
      .in("id", rejectIds);
    if (rejectError) {
      console.error("[onboarding] report_shares dedupe failed:", rejectError.message);
    }
  }
};

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = userData.user;
  const admin = createSupabaseAdminClient();
  const email = user.email?.trim();
  if (!email) {
    await recordActivity({
      admin,
      level: "warn",
      action: "auth.login.denied",
      actorUserId: user.id,
      message: "Connexion refusee: email introuvable.",
    });
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, org_id, full_name, active_workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.id) {
    if (!profile.full_name || !profile.full_name.trim()) {
      const derivedName =
        String(user.user_metadata?.full_name ?? "").trim() || email.split("@")[0];
      if (derivedName) {
        await admin
          .from("profiles")
          .update({ full_name: derivedName })
          .eq("id", profile.id);
      }
    }
    const personalWorkspaceId = await ensurePersonalWorkspace(
      admin,
      profile.id,
      profile.full_name ?? null
    );
    if (profile.role === "owner" || profile.role === "coach") {
      if (profile.org_id) {
        const role = profile.role === "owner" ? "admin" : "coach";
        await ensureOrgMembership(admin, profile.org_id, profile.id, role);
      }
      if (personalWorkspaceId && profile.active_workspace_id !== personalWorkspaceId) {
        await admin
          .from("profiles")
          .update({
            org_id: personalWorkspaceId,
            active_workspace_id: personalWorkspaceId,
          })
          .eq("id", profile.id);
      }
      const targetWorkspaceId =
        personalWorkspaceId ?? profile.active_workspace_id ?? profile.org_id ?? null;
      if (targetWorkspaceId) {
        await claimEmailedReportShares(admin, {
          email,
          userId: profile.id,
          targetOrgId: targetWorkspaceId,
        });
      }
    } else if (profile.role === "student") {
      const students = await loadStudentsByEmail(admin, email);
      if (students.length > 0) {
        await linkStudentAccounts(admin, profile.id, students);
        const primaryStudent = students[0];
        await admin
          .from("profiles")
          .update({
            org_id: primaryStudent.org_id,
            active_workspace_id: primaryStudent.org_id,
          })
          .eq("id", profile.id);
      } else if (!profile.active_workspace_id && profile.org_id) {
        await admin
          .from("profiles")
          .update({ active_workspace_id: profile.org_id })
          .eq("id", profile.id);
      }
    } else if (!profile.active_workspace_id && profile.org_id) {
      await admin
        .from("profiles")
        .update({ active_workspace_id: profile.org_id })
        .eq("id", profile.id);
    }
    await recordActivity({
      admin,
      action: "auth.login.success",
      actorUserId: profile.id,
      orgId: personalWorkspaceId ?? profile.active_workspace_id ?? profile.org_id ?? null,
      entityType: "profile",
      entityId: profile.id,
      message: "Connexion reussie.",
      metadata: {
        role: profile.role,
      },
    });
    return NextResponse.json({ ok: true, role: profile.role });
  }

  const students = await loadStudentsByEmail(admin, email);
  const primaryStudent = students[0];

  if (primaryStudent?.id && primaryStudent.org_id) {
    const fullName = `${primaryStudent.first_name ?? ""} ${primaryStudent.last_name ?? ""}`.trim();
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: user.id,
        org_id: primaryStudent.org_id,
        role: "student",
        full_name: fullName || null,
        active_workspace_id: primaryStudent.org_id,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await linkStudentAccounts(admin, user.id, students);
    await ensurePersonalWorkspace(admin, user.id, fullName || null);
    await recordActivity({
      admin,
      action: "auth.login.success",
      actorUserId: user.id,
      orgId: primaryStudent.org_id,
      entityType: "profile",
      entityId: user.id,
      message: "Connexion reussie.",
      metadata: {
        role: "student",
      },
    });
    return NextResponse.json({ ok: true, role: "student" });
  }

  const roleHint = String(user.user_metadata?.role ?? "").toLowerCase();
  if (roleHint !== "coach" && roleHint !== "owner") {
    await recordActivity({
      admin,
      level: "warn",
      action: "auth.login.denied",
      actorUserId: user.id,
      message: "Connexion refusee: role non autorise.",
    });
    return NextResponse.json(
      { error: "Acces reserve aux comptes invites." },
      { status: 403 }
    );
  }

  const fullName = String(user.user_metadata?.full_name ?? "").trim();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      role: roleHint === "owner" ? "owner" : "coach",
      full_name: fullName || null,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const personalWorkspaceId = await ensurePersonalWorkspace(
    admin,
    user.id,
    fullName || null
  );
  if (personalWorkspaceId) {
    await admin
      .from("profiles")
      .update({
        org_id: personalWorkspaceId,
        active_workspace_id: personalWorkspaceId,
      })
      .eq("id", user.id);
  } else {
    return NextResponse.json(
      { error: "Creation espace personnel impossible." },
      { status: 400 }
    );
  }

  const { data: membershipData } = await admin
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id);
  const orgIds = Array.from(
    new Set((membershipData ?? []).map((membership) => membership.org_id))
  );

  if (orgIds.length > 0) {
    const { data: orgsData } = await admin
      .from("organizations")
      .select("id, name, workspace_type, owner_profile_id")
      .in("id", orgIds);

    const legacyOrgIds =
      orgsData
        ?.filter(
          (org) =>
            org.workspace_type === "org" &&
            !org.owner_profile_id &&
            org.name === "Nouvelle organisation"
        )
        .map((org) => org.id) ?? [];

    if (legacyOrgIds.length > 0) {
      await admin
        .from("org_memberships")
        .delete()
        .eq("user_id", user.id)
        .in("org_id", legacyOrgIds);
    }
  }

  await claimEmailedReportShares(admin, {
    email,
    userId: user.id,
    targetOrgId: personalWorkspaceId,
  });

  await recordActivity({
    admin,
    action: "auth.login.success",
    actorUserId: user.id,
    orgId: personalWorkspaceId,
    entityType: "profile",
    entityId: user.id,
    message: "Connexion reussie.",
    metadata: {
      role: roleHint === "owner" ? "owner" : "coach",
    },
  });

  return NextResponse.json({
    ok: true,
    role: roleHint === "owner" ? "owner" : "coach",
  });
}
