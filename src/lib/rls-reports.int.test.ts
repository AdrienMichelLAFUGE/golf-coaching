/**
 * @jest-environment node
 */

import { createClient } from "@supabase/supabase-js";

type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
        };
        Insert: Partial<{
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
        }>;
        Update: Partial<{
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
        }>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          active_workspace_id: string | null;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        };
        Insert: {
          id: string;
          org_id: string;
          active_workspace_id: string | null;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        };
        Update: Partial<{
          org_id: string;
          active_workspace_id: string | null;
          role: "owner" | "coach" | "staff" | "student";
          full_name: string | null;
        }>;
        Relationships: [];
      };
      org_memberships: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: "admin" | "coach";
          status: "invited" | "active" | "disabled";
          premium_active: boolean;
        };
        Insert: {
          org_id: string;
          user_id: string;
          role: "admin" | "coach";
          status: "invited" | "active" | "disabled";
          premium_active: boolean;
        };
        Update: Partial<{
          role: "admin" | "coach";
          status: "invited" | "active" | "disabled";
          premium_active: boolean;
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
      student_assignments: {
        Row: {
          id: string;
          org_id: string;
          student_id: string;
          coach_id: string;
          created_by: string | null;
        };
        Insert: {
          org_id: string;
          student_id: string;
          coach_id: string;
          created_by?: string | null;
        };
        Update: Partial<{
          org_id: string;
          student_id: string;
          coach_id: string;
          created_by: string | null;
        }>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          org_id: string;
          student_id: string;
          author_id: string;
          title: string;
          content: string | null;
        };
        Insert: {
          org_id: string;
          student_id: string;
          author_id: string;
          title: string;
          content?: string | null;
        };
        Update: Partial<{
          title: string;
          content: string | null;
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

describeIf("RLS integration: reports", () => {
  const password = "Password123!";
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const orgName = `rls-org-${stamp}`;
  const coachEmail = `coach+${stamp}@example.com`;

  it("blocks report insert for free org coach", async () => {
    const admin = createClient<Database>(testEnv.url!, testEnv.serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const coachClient = createClient<Database>(testEnv.url!, testEnv.anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let orgId = "";
    let coachId = "";
    let studentId = "";

    const cleanup = async () => {
      if (studentId) {
        try {
          await admin.from("reports").delete().eq("student_id", studentId);
        } catch {}
        try {
          await admin.from("student_assignments").delete().eq("student_id", studentId);
        } catch {}
        try {
          await admin.from("students").delete().eq("id", studentId);
        } catch {}
      }
      if (coachId || orgId) {
        try {
          await admin
            .from("org_memberships")
            .delete()
            .eq("org_id", orgId)
            .eq("user_id", coachId);
        } catch {}
      }
      if (coachId) {
        try {
          await admin.from("profiles").delete().eq("id", coachId);
        } catch {}
        try {
          await admin.auth.admin.deleteUser(coachId);
        } catch {}
      }
      if (orgId) {
        try {
          await admin.from("organizations").delete().eq("id", orgId);
        } catch {}
      }
    };

    try {
      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({ name: orgName, workspace_type: "org", ai_enabled: false })
        .select("id")
        .single();
      if (orgError || !org) throw orgError ?? new Error("Org creation failed.");
      orgId = org.id;

      const { data: coachUser, error: coachError } = await admin.auth.admin.createUser({
        email: coachEmail,
        password,
        email_confirm: true,
      });
      if (coachError || !coachUser?.user) {
        throw coachError ?? new Error("Coach creation failed.");
      }
      coachId = coachUser.user.id;

      const { error: profileError } = await admin.from("profiles").upsert(
        {
          id: coachId,
          org_id: orgId,
          active_workspace_id: orgId,
          role: "coach",
          full_name: "Coach Free",
        },
        { onConflict: "id" }
      );
      if (profileError) throw profileError;

      const { error: membershipError } = await admin.from("org_memberships").insert({
        org_id: orgId,
        user_id: coachId,
        role: "coach",
        status: "active",
        premium_active: false,
      });
      if (membershipError) throw membershipError;

      const { data: student, error: studentError } = await admin
        .from("students")
        .insert({
          org_id: orgId,
          first_name: "Eleve",
          last_name: "Free",
          email: `student+${stamp}@example.com`,
        })
        .select("id")
        .single();
      if (studentError || !student) {
        throw studentError ?? new Error("Student creation failed.");
      }
      studentId = student.id;

      const { error: assignmentError } = await admin.from("student_assignments").insert({
        org_id: orgId,
        student_id: studentId,
        coach_id: coachId,
        created_by: coachId,
      });
      if (assignmentError) throw assignmentError;

      const { error: signInError } = await coachClient.auth.signInWithPassword({
        email: coachEmail,
        password,
      });
      if (signInError) throw signInError;

      const { data: insertData, error: insertError } = await coachClient
        .from("reports")
        .insert({
          org_id: orgId,
          student_id: studentId,
          author_id: coachId,
          title: "Rapport test",
          content: "Test",
        })
        .select("id");

      expect(insertError).not.toBeNull();
      expect(insertError?.message).toBeTruthy();
      expect(insertData ?? []).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });
});
