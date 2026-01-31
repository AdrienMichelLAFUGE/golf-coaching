/**
 * @jest-environment node
 */

import { createClient } from "@supabase/supabase-js";

type Database = {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string | null };
        Insert: { name: string | null };
        Update: { name?: string | null };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        };
        Insert: {
          id: string;
          org_id: string;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        };
        Update: Partial<{
          org_id: string;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        }>;
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          org_id: string;
          first_name: string;
          last_name: string | null;
          email: string | null;
        };
        Insert: {
          org_id: string;
          first_name: string;
          last_name?: string | null;
          email?: string | null;
        };
        Update: Partial<{
          first_name: string;
          last_name: string | null;
          email: string | null;
        }>;
        Relationships: [];
      };
      student_shares: {
        Row: {
          id: string;
          student_id: string;
          owner_id: string;
          viewer_id: string | null;
          viewer_email: string;
          student_email: string;
          status: string;
        };
        Insert: {
          student_id: string;
          owner_id: string;
          viewer_id?: string | null;
          viewer_email: string;
          student_email: string;
          status: string;
        };
        Update: Partial<{
          status: string;
        }>;
        Relationships: [];
      };
      normalized_test_assignments: {
        Row: {
          id: string;
          org_id: string;
          student_id: string;
          coach_id: string;
          test_slug: string;
          status: string;
          assigned_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          student_id: string;
          coach_id: string;
          test_slug: string;
          status: string;
          assigned_at: string;
          created_at: string;
          updated_at: string;
        };
        Update: Partial<{
          status: string;
        }>;
        Relationships: [];
      };
      normalized_test_attempts: {
        Row: {
          id: string;
          assignment_id: string;
          subtest_key: string;
          attempt_index: number;
          result_value: string;
          points: number;
        };
        Insert: {
          assignment_id: string;
          subtest_key: string;
          attempt_index: number;
          result_value: string;
          points: number;
        };
        Update: Partial<{
          result_value: string;
          points: number;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

const testEnv = {
  url: process.env.SUPABASE_TEST_URL,
  anonKey: process.env.SUPABASE_TEST_ANON_KEY,
  serviceKey: process.env.SUPABASE_TEST_SERVICE_KEY,
};

const hasTestEnv =
  Boolean(testEnv.url) && Boolean(testEnv.anonKey) && Boolean(testEnv.serviceKey);

const describeIf = hasTestEnv ? describe : describe.skip;

describeIf("RLS integration: student shares", () => {
  const password = "Password123!";
  const stamp = Date.now();
  const orgName = `rls-org-${stamp}`;
  const viewerOrgName = `rls-org-viewer-${stamp}`;
  const ownerEmail = `owner+${stamp}@example.com`;
  const viewerEmail = `viewer+${stamp}@example.com`;

  it("blocks read before active and blocks write after active", async () => {
    const admin = createClient<Database>(testEnv.url!, testEnv.serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const viewerClient = createClient<Database>(testEnv.url!, testEnv.anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let orgId = "";
    let viewerOrgId = "";
    let ownerId = "";
    let viewerId = "";
    let studentId = "";
    let assignmentId = "";

    const cleanup = async () => {
      if (assignmentId) {
        try {
          await admin
            .from("normalized_test_attempts")
            .delete()
            .eq("assignment_id", assignmentId);
        } catch {}
        try {
          await admin.from("normalized_test_assignments").delete().eq("id", assignmentId);
        } catch {}
      }
      if (studentId) {
        try {
          await admin.from("student_shares").delete().eq("student_id", studentId);
        } catch {}
        try {
          await admin.from("students").delete().eq("id", studentId);
        } catch {}
      }
      if (ownerId || viewerId) {
        try {
          await admin.from("profiles").delete().in("id", [ownerId, viewerId]);
        } catch {}
        try {
          if (ownerId) await admin.auth.admin.deleteUser(ownerId);
        } catch {}
        try {
          if (viewerId) await admin.auth.admin.deleteUser(viewerId);
        } catch {}
      }
      if (orgId) {
        try {
          await admin.from("organizations").delete().eq("id", orgId);
        } catch {}
      }
      if (viewerOrgId) {
        try {
          await admin.from("organizations").delete().eq("id", viewerOrgId);
        } catch {}
      }
    };

    try {
      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({ name: orgName })
        .select("id")
        .single();
      if (orgError || !org) throw orgError ?? new Error("Org creation failed.");
      orgId = org.id as string;

      const { data: viewerOrg, error: viewerOrgError } = await admin
        .from("organizations")
        .insert({ name: viewerOrgName })
        .select("id")
        .single();
      if (viewerOrgError || !viewerOrg) {
        throw viewerOrgError ?? new Error("Viewer org creation failed.");
      }
      viewerOrgId = viewerOrg.id as string;

      const { data: ownerUser, error: ownerError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
      });
      if (ownerError || !ownerUser?.user) {
        throw ownerError ?? new Error("Owner user creation failed.");
      }
      ownerId = ownerUser.user.id;

      const { data: viewerUser, error: viewerError } = await admin.auth.admin.createUser({
        email: viewerEmail,
        password,
        email_confirm: true,
      });
      if (viewerError || !viewerUser?.user) {
        throw viewerError ?? new Error("Viewer user creation failed.");
      }
      viewerId = viewerUser.user.id;

      const { error: profilesError } = await admin.from("profiles").upsert(
        [
          {
            id: ownerId,
            org_id: orgId,
            role: "owner",
            full_name: "Owner Test",
          },
          {
            id: viewerId,
            org_id: viewerOrgId,
            role: "coach",
            full_name: "Viewer Test",
          },
        ],
        { onConflict: "id" }
      );
      if (profilesError) throw profilesError;

      const { data: student, error: studentError } = await admin
        .from("students")
        .insert({
          org_id: orgId,
          first_name: "Test",
          last_name: "Student",
          email: `student+${stamp}@example.com`,
        })
        .select("id, email")
        .single();

      if (studentError || !student) {
        throw studentError ?? new Error("Student creation failed.");
      }
      studentId = student.id as string;

      const studentEmail = student.email ?? "";
      const { error: shareError } = await admin.from("student_shares").insert({
        student_id: studentId,
        owner_id: ownerId,
        viewer_id: viewerId,
        viewer_email: viewerEmail,
        student_email: studentEmail,
        status: "pending_student",
      });
      if (shareError) throw shareError;

      const { error: signInError } = await viewerClient.auth.signInWithPassword({
        email: viewerEmail,
        password,
      });
      if (signInError) throw signInError;

      const { data: beforeData, error: beforeError } = await viewerClient
        .from("students")
        .select("id")
        .eq("id", studentId);

      expect(beforeError).toBeNull();
      expect(beforeData ?? []).toHaveLength(0);

      const { error: activateError } = await admin
        .from("student_shares")
        .update({ status: "active" })
        .eq("student_id", studentId)
        .eq("viewer_email", viewerEmail);

      expect(activateError).toBeNull();

      const { data: afterData, error: afterError } = await viewerClient
        .from("students")
        .select("id")
        .eq("id", studentId);

      expect(afterError).toBeNull();
      expect(afterData ?? []).toHaveLength(1);

      const { data: updateData, error: updateError } = await viewerClient
        .from("students")
        .update({ first_name: "Hack" })
        .eq("id", studentId)
        .select("id");

      expect(updateError).toBeNull();
      expect(updateData ?? []).toHaveLength(0);

      const now = new Date().toISOString();
      const { data: assignment, error: assignmentError } = await admin
        .from("normalized_test_assignments")
        .insert({
          org_id: orgId,
          student_id: studentId,
          coach_id: ownerId,
          test_slug: "pelz-approches",
          status: "assigned",
          assigned_at: now,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      expect(assignmentError).toBeNull();
      assignmentId = assignment?.id ?? "";

      const { error: attemptError } = await viewerClient
        .from("normalized_test_attempts")
        .insert({
          assignment_id: assignmentId,
          subtest_key: "approche_levee",
          attempt_index: 1,
          result_value: "holed",
          points: 4,
        });

      expect(attemptError).not.toBeNull();
    } finally {
      await cleanup();
    }
  });
});
