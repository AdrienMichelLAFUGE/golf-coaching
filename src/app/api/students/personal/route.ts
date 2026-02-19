import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const personalStudentSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable().or(z.literal("")),
  email: z.string().email().optional().nullable().or(z.literal("")),
  playing_hand: z.enum(["right", "left"]).optional().nullable().or(z.literal("")),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, personalStudentSchema);
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
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const targetOrgId = profile.active_workspace_id ?? profile.org_id;
  if (!targetOrgId) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      message: "Creation eleve refusee: workspace personnel introuvable.",
    });
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 403 });
  }

  const { data: workspace } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", targetOrgId)
    .maybeSingle();

  if (!workspace || workspace.workspace_type !== "personal") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      orgId: targetOrgId,
      message: "Creation eleve refusee: workspace non personnel.",
    });
    return NextResponse.json(
      { error: "Creation eleve perso uniquement depuis un workspace personnel." },
      { status: 403 }
    );
  }

  if (workspace.owner_profile_id !== profile.id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      orgId: targetOrgId,
      message: "Creation eleve refusee: utilisateur non proprietaire du workspace personnel.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const normalizedEmail = parsed.data.email?.trim().toLowerCase() ?? "";
  if (normalizedEmail) {
    const { data: existingElsewhere, error: existingElsewhereError } = await admin
      .from("students")
      .select("id, org_id, first_name, last_name, email, playing_hand, created_at")
      .ilike("email", normalizedEmail)
      .neq("org_id", targetOrgId)
      .order("created_at", { ascending: true });

    if (existingElsewhereError) {
      await recordActivity({
        admin,
        level: "error",
        action: "student.create.pending_owner_lookup_failed",
        actorUserId: profile.id,
        orgId: targetOrgId,
        message: existingElsewhereError.message ?? "Recherche eleve existant impossible.",
        metadata: {
          email: normalizedEmail,
        },
      });
      return NextResponse.json(
        { error: existingElsewhereError.message ?? "Verification des doublons impossible." },
        { status: 400 }
      );
    }

    const existingRows = (existingElsewhere ?? []) as Array<{
      id: string;
      org_id: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      playing_hand: "right" | "left" | null;
      created_at?: string;
    }>;

    if (existingRows.length > 0) {
      const ownerWorkspaceIds = Array.from(
        new Set(existingRows.map((row) => row.org_id).filter((id): id is string => Boolean(id)))
      );

      const { data: ownerWorkspaces, error: ownerWorkspacesError } = await admin
        .from("organizations")
        .select("id, workspace_type, owner_profile_id")
        .in("id", ownerWorkspaceIds);

      if (ownerWorkspacesError) {
        await recordActivity({
          admin,
          level: "error",
          action: "student.create.pending_owner_lookup_failed",
          actorUserId: profile.id,
          orgId: targetOrgId,
          message:
            ownerWorkspacesError.message ?? "Recherche workspace proprietaire impossible.",
          metadata: {
            email: normalizedEmail,
          },
        });
        return NextResponse.json(
          {
            error:
              ownerWorkspacesError.message ??
              "Verification du coach proprietaire impossible.",
          },
          { status: 400 }
        );
      }

      const workspaceById = new Map<
        string,
        { workspace_type: "personal" | "org"; owner_profile_id: string | null }
      >();
      (ownerWorkspaces ?? []).forEach((workspace) => {
        const row = workspace as {
          id: string;
          workspace_type: "personal" | "org";
          owner_profile_id: string | null;
        };
        workspaceById.set(row.id, {
          workspace_type: row.workspace_type,
          owner_profile_id: row.owner_profile_id,
        });
      });

      const ownerCandidate = existingRows.find((row) => {
        const workspace = workspaceById.get(row.org_id);
        return (
          workspace?.workspace_type === "personal" &&
          Boolean(workspace.owner_profile_id) &&
          workspace.owner_profile_id !== profile.id
        );
      });

      if (ownerCandidate) {
        const ownerWorkspace = workspaceById.get(ownerCandidate.org_id);
        const sourceOwnerUserId = ownerWorkspace?.owner_profile_id ?? null;

        if (!sourceOwnerUserId) {
          await recordActivity({
            admin,
            level: "warn",
            action: "student.create.pending_owner_missing_admin",
            actorUserId: profile.id,
            orgId: targetOrgId,
            entityType: "student",
            entityId: ownerCandidate.id,
            message:
              "Demande inter-coach impossible: aucun proprietaire actif pour l eleve source.",
            metadata: {
              email: normalizedEmail,
              sourceOrgId: ownerCandidate.org_id,
            },
          });
          return NextResponse.json(
            { error: "Aucun coach proprietaire actif trouve pour cet eleve." },
            { status: 409 }
          );
        }

        const requesterEmail = userData.user.email?.trim().toLowerCase();
        if (!requesterEmail) {
          return NextResponse.json(
            {
              error:
                "Email utilisateur introuvable. Impossible d envoyer la demande d ajout.",
            },
            { status: 400 }
          );
        }

        const { data: existingActiveShare } = await admin
          .from("student_shares")
          .select("id")
          .eq("student_id", ownerCandidate.id)
          .ilike("viewer_email", requesterEmail)
          .eq("status", "active")
          .maybeSingle();

        if (existingActiveShare?.id) {
          return NextResponse.json({
            ok: true,
            pendingRequest: false,
            message: "Cet eleve est deja partage avec ton compte.",
          });
        }

        const { data: existingPendingRequest } = await admin
          .from("personal_student_link_requests")
          .select("id")
          .eq("source_student_id", ownerCandidate.id)
          .eq("requester_user_id", profile.id)
          .eq("status", "pending")
          .maybeSingle();

        if (existingPendingRequest?.id) {
          return NextResponse.json({
            ok: true,
            pendingRequest: true,
            message:
              "Demande deja envoyee au coach proprietaire. En attente de validation.",
          });
        }

        const { error: requestInsertError } = await admin
          .from("personal_student_link_requests")
          .insert([
            {
              source_student_id: ownerCandidate.id,
              source_org_id: ownerCandidate.org_id,
              source_owner_user_id: sourceOwnerUserId,
              requester_org_id: targetOrgId,
              requester_user_id: profile.id,
              requester_email: requesterEmail,
              student_email: normalizedEmail,
              requested_first_name: parsed.data.first_name.trim(),
              requested_last_name: parsed.data.last_name?.trim() || null,
              requested_playing_hand: parsed.data.playing_hand || null,
              status: "pending",
            },
          ]);

        if (requestInsertError) {
          await recordActivity({
            admin,
            level: "error",
            action: "student.create.pending_request_failed",
            actorUserId: profile.id,
            orgId: targetOrgId,
            entityType: "student",
            entityId: ownerCandidate.id,
            message:
              requestInsertError.message ??
              "Creation de la demande d approbation inter-coach impossible.",
            metadata: {
              email: normalizedEmail,
              sourceOrgId: ownerCandidate.org_id,
              sourceOwnerUserId,
            },
          });
          return NextResponse.json(
            {
              error:
                requestInsertError.message ??
                "Creation de la demande d approbation impossible.",
            },
            { status: 400 }
          );
        }

        await recordActivity({
          admin,
          action: "student.create.pending_owner_approval",
          actorUserId: profile.id,
          orgId: targetOrgId,
          entityType: "student",
          entityId: ownerCandidate.id,
          message: "Demande envoyee au coach proprietaire pour ajout d eleve.",
          metadata: {
            email: normalizedEmail,
            sourceOrgId: ownerCandidate.org_id,
            sourceOwnerUserId,
          },
        });

        return NextResponse.json({
          ok: true,
          pendingRequest: true,
          message:
            "Eleve deja present chez un autre coach. Demande envoyee au coach proprietaire.",
        });
      }
    }
  }

  const { data: student, error: insertError } = await admin
    .from("students")
    .insert([
      {
        org_id: targetOrgId,
        first_name: parsed.data.first_name.trim(),
        last_name: parsed.data.last_name?.trim() || null,
        email: normalizedEmail || null,
        playing_hand: parsed.data.playing_hand || null,
        parent_secret_code_plain: null,
        parent_secret_code_hash: null,
        parent_secret_code_rotated_at: null,
      },
    ])
    .select("id")
    .single();

  if (insertError || !student) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.create.failed",
      actorUserId: profile.id,
      orgId: targetOrgId,
      message: insertError?.message ?? "Creation eleve perso impossible.",
      metadata: {
        email: normalizedEmail || null,
      },
    });
    return NextResponse.json(
      { error: insertError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "student.create.success",
    actorUserId: profile.id,
    orgId: targetOrgId,
    entityType: "student",
    entityId: student.id,
    message: "Eleve cree dans le workspace personnel.",
    metadata: {
      email: normalizedEmail || null,
      workspaceType: "personal",
    },
  });

  return NextResponse.json({ ok: true, studentId: student.id });
}
