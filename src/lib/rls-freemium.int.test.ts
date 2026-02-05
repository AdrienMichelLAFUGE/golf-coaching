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
          plan_tier: "free" | "pro" | "enterprise";
        };
        Insert: Partial<{
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
          plan_tier: "free" | "pro" | "enterprise";
        }>;
        Update: Partial<{
          name: string | null;
          workspace_type: "personal" | "org";
          ai_enabled: boolean | null;
          owner_profile_id: string | null;
          plan_tier: "free" | "pro" | "enterprise";
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
      org_groups: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
        };
        Insert: {
          org_id: string;
          name: string;
          description?: string | null;
        };
        Update: Partial<{
          name: string;
          description: string | null;
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
      student_accounts: {
        Row: {
          id: string;
          student_id: string;
          user_id: string;
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
  const studentEmail = `student-linked+${stamp}@example.com`;

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
          await admin.from("org_groups").delete().eq("org_id", orgId);
        } catch {}
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

      const { data: groupInsertData, error: groupInsertError } = await coachClient
        .from("org_groups")
        .insert({
          org_id: orgId,
          name: "Groupe Free",
        })
        .select("id");

      expect(groupInsertError).not.toBeNull();
      expect(groupInsertData ?? []).toHaveLength(0);

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

  it("allows org coach to read linked TPI/radar from another workspace", async () => {
    const admin = createClient<Database>(testEnv.url!, testEnv.serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const coachClient = createClient<Database>(testEnv.url!, testEnv.anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let orgId = "";
    let personalOrgId = "";
    let coachId = "";
    let studentUserId = "";
    let studentOrgId = "";
    let studentPersonalId = "";

    const cleanup = async () => {
      if (studentPersonalId) {
        try {
          await admin.from("radar_files").delete().eq("student_id", studentPersonalId);
        } catch {}
        try {
          await admin.from("tpi_reports").delete().eq("student_id", studentPersonalId);
        } catch {}
      }
      if (studentOrgId || studentPersonalId) {
        try {
          await admin
            .from("student_accounts")
            .delete()
            .in("student_id", [studentOrgId, studentPersonalId].filter(Boolean));
        } catch {}
        try {
          await admin
            .from("students")
            .delete()
            .in("id", [studentOrgId, studentPersonalId].filter(Boolean));
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
      if (personalOrgId) {
        try {
          await admin.from("organizations").delete().eq("id", personalOrgId);
        } catch {}
      }
    };

    try {
      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({
          name: `${orgName}-linked`,
          workspace_type: "org",
          plan_tier: "free",
          ai_enabled: true,
        })
        .select("id")
        .single();
      if (orgError || !org) throw orgError ?? new Error("Org creation failed.");
      orgId = org.id;

      const { data: personalOrg, error: personalOrgError } = await admin
        .from("organizations")
        .insert({
          name: `${orgName}-personal`,
          workspace_type: "personal",
          ai_enabled: true,
        })
        .select("id")
        .single();
      if (personalOrgError || !personalOrg)
        throw personalOrgError ?? new Error("Personal org creation failed.");
      personalOrgId = personalOrg.id;

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
          full_name: "Coach Linked",
        },
        { onConflict: "id" }
      );
      if (profileError) throw profileError;

      const { error: membershipError } = await admin.from("org_memberships").insert({
        org_id: orgId,
        user_id: coachId,
        role: "coach",
        status: "active",
        premium_active: true,
      });
      if (membershipError) throw membershipError;

      const { data: studentUser, error: studentUserError } =
        await admin.auth.admin.createUser({
          email: studentEmail,
          password,
          email_confirm: true,
        });
      if (studentUserError || !studentUser?.user) {
        throw studentUserError ?? new Error("Student user creation failed.");
      }
      studentUserId = studentUser.user.id;

      const { error: studentProfileError } = await admin.from("profiles").upsert(
        {
          id: studentUserId,
          org_id: orgId,
          active_workspace_id: orgId,
          role: "student",
          full_name: "Student Linked",
        },
        { onConflict: "id" }
      );
      if (studentProfileError) throw studentProfileError;

      const { data: studentOrg, error: studentOrgError } = await admin
        .from("students")
        .insert({
          org_id: orgId,
          first_name: "Eleve",
          last_name: "Org",
          email: studentEmail,
        })
        .select("id")
        .single();
      if (studentOrgError || !studentOrg) {
        throw studentOrgError ?? new Error("Org student creation failed.");
      }
      studentOrgId = studentOrg.id;

      const { data: studentPersonal, error: studentPersonalError } = await admin
        .from("students")
        .insert({
          org_id: personalOrgId,
          first_name: "Eleve",
          last_name: "Perso",
          email: studentEmail,
        })
        .select("id")
        .single();
      if (studentPersonalError || !studentPersonal) {
        throw studentPersonalError ?? new Error("Personal student creation failed.");
      }
      studentPersonalId = studentPersonal.id;

      const { error: linkError } = await admin.from("student_accounts").insert([
        { student_id: studentOrgId, user_id: studentUserId },
        { student_id: studentPersonalId, user_id: studentUserId },
      ]);
      if (linkError) throw linkError;

      const { error: tpiError } = await admin.from("tpi_reports").insert({
        org_id: personalOrgId,
        student_id: studentPersonalId,
        uploaded_by: coachId,
        file_url: `linked-${stamp}.pdf`,
        file_type: "pdf",
        original_name: "tpi.pdf",
        status: "ready",
      });
      if (tpiError) throw tpiError;

      const { error: radarError } = await admin.from("radar_files").insert({
        org_id: personalOrgId,
        student_id: studentPersonalId,
        file_url: `linked-${stamp}.png`,
        file_mime: "image/png",
        original_name: "radar.png",
        status: "ready",
      });
      if (radarError) throw radarError;

      const { error: signInError } = await coachClient.auth.signInWithPassword({
        email: coachEmail,
        password,
      });
      if (signInError) throw signInError;

      const { data: tpiRead, error: tpiReadError } = await coachClient
        .from("tpi_reports")
        .select("id")
        .eq("student_id", studentPersonalId);
      expect(tpiReadError).toBeNull();
      expect(tpiRead ?? []).toHaveLength(1);

      const { data: radarRead, error: radarReadError } = await coachClient
        .from("radar_files")
        .select("id")
        .eq("student_id", studentPersonalId);
      expect(radarReadError).toBeNull();
      expect(radarRead ?? []).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
