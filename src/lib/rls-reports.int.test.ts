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
      report_sections: {
        Row: {
          id: string;
          org_id: string;
          report_id: string;
          title: string;
          position: number;
        };
        Insert: {
          org_id: string;
          report_id: string;
          title: string;
          position?: number;
        };
        Update: Partial<{
          title: string;
          position: number;
        }>;
        Relationships: [];
      };
      student_accounts: {
        Row: {
          id: string;
          student_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          student_id: string;
          user_id: string;
        };
        Update: Partial<{
          student_id: string;
          user_id: string;
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

  it("allows coach to read linked student reports across workspaces", async () => {
    const admin = createClient<Database>(testEnv.url!, testEnv.serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const coachClient = createClient<Database>(testEnv.url!, testEnv.anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let orgPersonalId = "";
    let orgOrgId = "";
    let coachId = "";
    let studentUserId = "";
    let studentOrgId = "";
    let studentPersonalId = "";
    let reportId = "";
    let sectionId = "";

    const cleanup = async () => {
      if (sectionId) {
        try {
          await admin.from("report_sections").delete().eq("id", sectionId);
        } catch {}
      }
      if (reportId) {
        try {
          await admin.from("reports").delete().eq("id", reportId);
        } catch {}
      }
      if (studentOrgId || studentPersonalId) {
        try {
          await admin
            .from("student_accounts")
            .delete()
            .in("student_id", [studentOrgId, studentPersonalId].filter(Boolean));
        } catch {}
      }
      if (studentOrgId) {
        try {
          await admin.from("students").delete().eq("id", studentOrgId);
        } catch {}
      }
      if (studentPersonalId) {
        try {
          await admin.from("students").delete().eq("id", studentPersonalId);
        } catch {}
      }
      if (coachId || orgOrgId) {
        try {
          await admin
            .from("org_memberships")
            .delete()
            .eq("org_id", orgOrgId)
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
      if (studentUserId) {
        try {
          await admin.from("profiles").delete().eq("id", studentUserId);
        } catch {}
        try {
          await admin.auth.admin.deleteUser(studentUserId);
        } catch {}
      }
      if (orgOrgId) {
        try {
          await admin.from("organizations").delete().eq("id", orgOrgId);
        } catch {}
      }
      if (orgPersonalId) {
        try {
          await admin.from("organizations").delete().eq("id", orgPersonalId);
        } catch {}
      }
    };

    try {
      const { data: personalOrg, error: personalError } = await admin
        .from("organizations")
        .insert({ name: `rls-personal-${stamp}`, workspace_type: "personal", ai_enabled: true })
        .select("id")
        .single();
      if (personalError || !personalOrg) throw personalError ?? new Error("Org personal failed.");
      orgPersonalId = personalOrg.id;

      const { data: orgOrg, error: orgError } = await admin
        .from("organizations")
        .insert({ name: `rls-org-linked-${stamp}`, workspace_type: "org", ai_enabled: true })
        .select("id")
        .single();
      if (orgError || !orgOrg) throw orgError ?? new Error("Org creation failed.");
      orgOrgId = orgOrg.id;

      const { data: coachUser, error: coachError } = await admin.auth.admin.createUser({
        email: `coach-linked+${stamp}@example.com`,
        password,
        email_confirm: true,
      });
      if (coachError || !coachUser?.user) {
        throw coachError ?? new Error("Coach creation failed.");
      }
      coachId = coachUser.user.id;

      const { error: coachProfileError } = await admin.from("profiles").upsert(
        {
          id: coachId,
          org_id: orgOrgId,
          active_workspace_id: orgOrgId,
          role: "coach",
          full_name: "Coach Linked",
        },
        { onConflict: "id" }
      );
      if (coachProfileError) throw coachProfileError;

      const { error: membershipError } = await admin.from("org_memberships").insert({
        org_id: orgOrgId,
        user_id: coachId,
        role: "coach",
        status: "active",
        premium_active: true,
      });
      if (membershipError) throw membershipError;

      const studentEmail = `student-linked+${stamp}@example.com`;
      const { data: studentUser, error: studentUserError } =
        await admin.auth.admin.createUser({
          email: studentEmail,
          password,
          email_confirm: true,
        });
      if (studentUserError || !studentUser?.user) {
        throw studentUserError ?? new Error("Student user failed.");
      }
      studentUserId = studentUser.user.id;

      const { error: studentProfileError } = await admin.from("profiles").upsert(
        {
          id: studentUserId,
          org_id: orgOrgId,
          active_workspace_id: orgOrgId,
          role: "student",
          full_name: "Student Linked",
        },
        { onConflict: "id" }
      );
      if (studentProfileError) throw studentProfileError;

      const { data: studentOrg, error: studentOrgError } = await admin
        .from("students")
        .insert({
          org_id: orgOrgId,
          first_name: "Eleve",
          last_name: "Org",
          email: studentEmail,
        })
        .select("id")
        .single();
      if (studentOrgError || !studentOrg) {
        throw studentOrgError ?? new Error("Student org failed.");
      }
      studentOrgId = studentOrg.id;

      const { data: studentPersonal, error: studentPersonalError } = await admin
        .from("students")
        .insert({
          org_id: orgPersonalId,
          first_name: "Eleve",
          last_name: "Perso",
          email: studentEmail,
        })
        .select("id")
        .single();
      if (studentPersonalError || !studentPersonal) {
        throw studentPersonalError ?? new Error("Student personal failed.");
      }
      studentPersonalId = studentPersonal.id;

      const { error: accountError } = await admin.from("student_accounts").insert([
        { student_id: studentOrgId, user_id: studentUserId },
        { student_id: studentPersonalId, user_id: studentUserId },
      ]);
      if (accountError) throw accountError;

      const { data: reportData, error: reportError } = await admin
        .from("reports")
        .insert({
          org_id: orgPersonalId,
          student_id: studentPersonalId,
          author_id: coachId,
          title: "Rapport perso",
          content: "Test",
        })
        .select("id")
        .single();
      if (reportError || !reportData) {
        throw reportError ?? new Error("Report creation failed.");
      }
      reportId = reportData.id;

      const { data: sectionData, error: sectionError } = await admin
        .from("report_sections")
        .insert({
          org_id: orgPersonalId,
          report_id: reportId,
          title: "Section",
          position: 1,
        })
        .select("id")
        .single();
      if (sectionError || !sectionData) {
        throw sectionError ?? new Error("Section creation failed.");
      }
      sectionId = sectionData.id;

      const { error: signInError } = await coachClient.auth.signInWithPassword({
        email: `coach-linked+${stamp}@example.com`,
        password,
      });
      if (signInError) throw signInError;

      const { data: reportRead, error: reportReadError } = await coachClient
        .from("reports")
        .select("id")
        .eq("id", reportId)
        .maybeSingle();

      expect(reportReadError).toBeNull();
      expect(reportRead?.id).toBe(reportId);

      const { data: sectionRead, error: sectionReadError } = await coachClient
        .from("report_sections")
        .select("id")
        .eq("report_id", reportId)
        .maybeSingle();

      expect(sectionReadError).toBeNull();
      expect(sectionRead?.id).toBe(sectionId);
    } finally {
      await cleanup();
    }
  });
});
