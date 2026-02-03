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
          plan_tier: "free" | "standard" | "pro" | "enterprise";
        };
        Insert: Partial<{
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
          plan_tier: "free" | "standard" | "pro" | "enterprise";
        }>;
        Update: Partial<{
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
          plan_tier: "free" | "standard" | "pro" | "enterprise";
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
      tpi_reports: {
        Row: {
          id: string;
          org_id: string;
          student_id: string;
          uploaded_by: string | null;
          file_url: string;
          file_type: "pdf" | "image";
        };
        Insert: {
          org_id: string;
          student_id: string;
          uploaded_by?: string | null;
          file_url: string;
          file_type: "pdf" | "image";
          original_name?: string | null;
        };
        Update: Partial<{
          file_url: string;
        }>;
        Relationships: [];
      };
      radar_files: {
        Row: {
          id: string;
          org_id: string;
          student_id: string;
          file_url: string;
        };
        Insert: {
          org_id: string;
          student_id: string;
          file_url: string;
          file_mime?: string | null;
          original_name?: string | null;
        };
        Update: Partial<{
          file_url: string;
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

describeIf("RLS integration: freemium org", () => {
  const password = "Password123!";
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const orgName = `rls-org-free-${stamp}`;
  const coachEmail = `coach-free+${stamp}@example.com`;

  it("blocks student + TPI + radar inserts for free org member", async () => {
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
          await admin.from("radar_files").delete().eq("student_id", studentId);
        } catch {}
        try {
          await admin.from("tpi_reports").delete().eq("student_id", studentId);
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
        .insert({
          name: orgName,
          workspace_type: "org",
          plan_tier: "free",
          ai_enabled: true,
        })
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

      const { error: signInError } = await coachClient.auth.signInWithPassword({
        email: coachEmail,
        password,
      });
      if (signInError) throw signInError;

      const { data: studentInsertData, error: studentInsertError } = await coachClient
        .from("students")
        .insert({
          org_id: orgId,
          first_name: "Hack",
          last_name: "Try",
          email: `hack+${stamp}@example.com`,
        })
        .select("id");

      expect(studentInsertError).not.toBeNull();
      expect(studentInsertData ?? []).toHaveLength(0);

      const { data: tpiInsertData, error: tpiInsertError } = await coachClient
        .from("tpi_reports")
        .insert({
          org_id: orgId,
          student_id: studentId,
          uploaded_by: coachId,
          file_url: `test-${stamp}.pdf`,
          file_type: "pdf",
          original_name: "tpi.pdf",
        })
        .select("id");

      expect(tpiInsertError).not.toBeNull();
      expect(tpiInsertData ?? []).toHaveLength(0);

      const { data: radarInsertData, error: radarInsertError } = await coachClient
        .from("radar_files")
        .insert({
          org_id: orgId,
          student_id: studentId,
          file_url: `radar-${stamp}.png`,
          file_mime: "image/png",
          original_name: "radar.png",
        })
        .select("id");

      expect(radarInsertError).not.toBeNull();
      expect(radarInsertData ?? []).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });
});
