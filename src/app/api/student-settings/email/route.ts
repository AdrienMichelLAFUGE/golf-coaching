import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { env } from "@/env";
import { recordActivity } from "@/lib/activity-log";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const updateEmailSchema = z.object({
  email: z.string().trim().email().max(320),
});

type StudentAccountRow = {
  student_id: string;
};

const AUTH_SESSION_MISSING_ERROR = "Auth session missing!";

type SupabaseAuthErrorPayload = {
  error?: string;
  message?: string;
  error_description?: string;
  msg?: string;
  code?: string | number;
};

type AuthEmailUpdateResult = {
  ok: boolean;
  error: string | null;
  requiresEmailConfirmation: boolean;
};

const resolveEmailChangeRedirectTo = ({
  oldEmail,
  newEmail,
}: {
  oldEmail: string;
  newEmail: string;
}) => {
  const origin = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const params = new URLSearchParams({
    flow: "email-change",
    next: "/auth/email-change",
    oldEmail,
    newEmail,
  });
  return `${origin}/auth/callback?${params.toString()}`;
};

const updateAuthEmailWithBearer = async ({
  authHeader,
  email,
  emailRedirectTo,
}: {
  authHeader: string | null;
  email: string;
  emailRedirectTo: string;
}): Promise<AuthEmailUpdateResult> => {
  if (!authHeader) {
    return {
      ok: false,
      error: AUTH_SESSION_MISSING_ERROR,
      requiresEmailConfirmation: false,
    };
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        email_redirect_to: emailRedirectTo,
      }),
    });

    if (response.ok) {
      return { ok: true, error: null, requiresEmailConfirmation: true };
    }

    const payload = (await response.json().catch(() => null)) as SupabaseAuthErrorPayload | null;
    const fallbackMessage =
      payload?.error_description ??
      payload?.message ??
      payload?.msg ??
      payload?.error ??
      `Auth update failed (${response.status}).`;

    return {
      ok: false,
      error: fallbackMessage,
      requiresEmailConfirmation: false,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Mise a jour email impossible.",
      requiresEmailConfirmation: false,
    };
  }
};

const updateAuthEmailWithAdminFallback = async ({
  admin,
  userId,
  email,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  email: string;
}): Promise<AuthEmailUpdateResult> => {
  const { error } = await admin.auth.admin.updateUserById(userId, { email });
  if (error) {
    return {
      ok: false,
      error: error.message ?? "Mise a jour email admin impossible.",
      requiresEmailConfirmation: false,
    };
  }

  return {
    ok: true,
    error: null,
    requiresEmailConfirmation: false,
  };
};

export async function PATCH(request: Request) {
  const parsed = await parseRequestJson(request, updateEmailSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const userId = userData.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "student") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.email.update.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Mise a jour email eleve refusee: role non autorise.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const currentEmail = userData.user.email?.trim().toLowerCase() ?? "";

  const { data: accountRows, error: accountError } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", userId);

  if (accountError) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.email.update.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: accountError.message ?? "Chargement liens eleve impossible.",
    });
    return NextResponse.json(
      { error: accountError.message ?? "Chargement eleve impossible." },
      { status: 500 }
    );
  }

  const studentIds = ((accountRows ?? []) as StudentAccountRow[]).map((row) => row.student_id);
  if (studentIds.length === 0) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.email.update.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Mise a jour email eleve refusee: aucun profil eleve lie.",
    });
    return NextResponse.json({ error: "Profil eleve introuvable." }, { status: 404 });
  }

  const shouldUpdateAuthEmail = normalizedEmail !== currentEmail;
  let requiresEmailConfirmation = false;
  if (shouldUpdateAuthEmail) {
    const emailRedirectTo = resolveEmailChangeRedirectTo({
      oldEmail: currentEmail || normalizedEmail,
      newEmail: normalizedEmail,
    });
    const authHeader = request.headers.get("authorization");
    const { error: authUpdateError } = await supabase.auth.updateUser(
      {
        email: normalizedEmail,
      },
      {
        emailRedirectTo,
      }
    );

    let authUpdateErrorMessage: string | null = authUpdateError
      ? authUpdateError.message ?? "Mise a jour email auth impossible."
      : null;

    const isSessionMissing =
      (authUpdateError?.message ?? "")
        .toLowerCase()
        .includes(AUTH_SESSION_MISSING_ERROR.toLowerCase());

    if (isSessionMissing) {
      const fallbackResult = await updateAuthEmailWithBearer({
        authHeader,
        email: normalizedEmail,
        emailRedirectTo,
      });
      if (fallbackResult.ok) {
        authUpdateErrorMessage = null;
        requiresEmailConfirmation = fallbackResult.requiresEmailConfirmation;
      } else {
        authUpdateErrorMessage = fallbackResult.error;
      }
    } else if (!authUpdateErrorMessage) {
      requiresEmailConfirmation = true;
    }

    if (authUpdateErrorMessage) {
      const adminFallbackResult = await updateAuthEmailWithAdminFallback({
        admin,
        userId,
        email: normalizedEmail,
      });
      if (adminFallbackResult.ok) {
        authUpdateErrorMessage = null;
        requiresEmailConfirmation = adminFallbackResult.requiresEmailConfirmation;
      } else {
        authUpdateErrorMessage = adminFallbackResult.error;
      }
    }

    if (authUpdateErrorMessage) {
      await recordActivity({
        admin,
        level: "error",
        action: "student.email.update.failed",
        actorUserId: userId,
        entityType: "profile",
        entityId: userId,
        message: authUpdateErrorMessage,
      });
      return NextResponse.json(
        { error: authUpdateErrorMessage },
        { status: 400 }
      );
    }
  }

  const { error: studentUpdateError } = await admin
    .from("students")
    .update({ email: normalizedEmail })
    .in("id", studentIds);

  if (studentUpdateError) {
    if (shouldUpdateAuthEmail && currentEmail) {
      await admin.auth.admin.updateUserById(userId, {
        email: currentEmail,
      });
    }

    await recordActivity({
      admin,
      level: "error",
      action: "student.email.update.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: studentUpdateError.message ?? "Propagation email eleve impossible.",
      metadata: {
        studentCount: studentIds.length,
      },
    });

    return NextResponse.json(
      { error: studentUpdateError.message ?? "Propagation email impossible." },
      { status: 500 }
    );
  }

  await recordActivity({
    admin,
    action: "student.email.update.success",
    actorUserId: userId,
    entityType: "profile",
    entityId: userId,
    message: "Email eleve synchronise sur tous les workspaces lies.",
    metadata: {
      studentCount: studentIds.length,
      emailChanged: shouldUpdateAuthEmail,
    },
  });

  return NextResponse.json({
    ok: true,
    email: normalizedEmail,
    syncedStudentCount: studentIds.length,
    requiresEmailConfirmation,
  });
}
