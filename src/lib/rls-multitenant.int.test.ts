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

describeIf("RLS integration: multi-tenant students", () => {
  const password = "Password123!";
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const orgAName = `rls-org-a-${stamp}`;
  const orgBName = `rls-org-b-${stamp}`;
  const coachAEmail = `coach-a+${stamp}@example.com`;
  const coachBEmail = `coach-b+${stamp}@example.com`;

  it("allows same-org read and blocks cross-org read/write", async () => {
    const admin = createClient<Database>(testEnv.url!, testEnv.serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const coachAClient = createClient<Database>(testEnv.url!, testEnv.anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const coachBClient = createClient<Database>(testEnv.url!, testEnv.anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let orgAId = "";
    let orgBId = "";
    let coachAId = "";
    let coachBId = "";
    let studentId = "";

    const cleanup = async () => {
      if (studentId) {
        try {
          await admin.from("students").delete().eq("id", studentId);
        } catch {}
      }
      if (coachAId || coachBId || orgAId || orgBId) {
        try {
          await admin
            .from("org_memberships")
            .delete()
            .in("user_id", [coachAId, coachBId])
            .in("org_id", [orgAId, orgBId]);
        } catch {}
      }
      try {
        await admin
          .from("organizations")
          .delete()
          .in("owner_profile_id", [coachAId, coachBId]);
      } catch {}
      if (coachAId || coachBId) {
        try {
          await admin.from("profiles").delete().in("id", [coachAId, coachBId]);
        } catch {}
        try {
          if (coachAId) await admin.auth.admin.deleteUser(coachAId);
        } catch {}
        try {
          if (coachBId) await admin.auth.admin.deleteUser(coachBId);
        } catch {}
      }
      if (orgAId) {
        try {
          await admin.from("organizations").delete().eq("id", orgAId);
        } catch {}
      }
      if (orgBId) {
        try {
          await admin.from("organizations").delete().eq("id", orgBId);
        } catch {}
      }
    };

    try {
      const { data: orgA, error: orgAError } = await admin
        .from("organizations")
        .insert({ name: orgAName, workspace_type: "org", ai_enabled: true })
        .select("id")
        .single();
      if (orgAError || !orgA) throw orgAError ?? new Error("Org A creation failed.");
      orgAId = orgA.id;

      const { data: orgB, error: orgBError } = await admin
        .from("organizations")
        .insert({ name: orgBName, workspace_type: "org", ai_enabled: true })
        .select("id")
        .single();
      if (orgBError || !orgB) throw orgBError ?? new Error("Org B creation failed.");
      orgBId = orgB.id;

      const { data: coachAUser, error: coachAError } =
        await admin.auth.admin.createUser({
          email: coachAEmail,
          password,
          email_confirm: true,
        });
      if (coachAError || !coachAUser?.user) {
        throw coachAError ?? new Error("Coach A creation failed.");
      }
      coachAId = coachAUser.user.id;

      const { data: coachBUser, error: coachBError } =
        await admin.auth.admin.createUser({
          email: coachBEmail,
          password,
          email_confirm: true,
        });
      if (coachBError || !coachBUser?.user) {
        throw coachBError ?? new Error("Coach B creation failed.");
      }
      coachBId = coachBUser.user.id;

      const { error: profilesError } = await admin.from("profiles").upsert(
        [
          {
            id: coachAId,
            org_id: orgAId,
            active_workspace_id: orgAId,
            role: "coach",
            full_name: "Coach A",
          },
          {
            id: coachBId,
            org_id: orgBId,
            active_workspace_id: orgBId,
            role: "coach",
            full_name: "Coach B",
          },
        ],
        { onConflict: "id" }
      );
      if (profilesError) throw profilesError;

      const { error: membershipError } = await admin.from("org_memberships").insert([
        {
          org_id: orgAId,
          user_id: coachAId,
          role: "coach",
          status: "active",
          premium_active: true,
        },
        {
          org_id: orgBId,
          user_id: coachBId,
          role: "coach",
          status: "active",
          premium_active: true,
        },
      ]);
      if (membershipError) throw membershipError;

      const { data: student, error: studentError } = await admin
        .from("students")
        .insert({
          org_id: orgAId,
          first_name: "Alice",
          last_name: "Test",
          email: `student-a+${stamp}@example.com`,
        })
        .select("id")
        .single();
      if (studentError || !student) {
        throw studentError ?? new Error("Student creation failed.");
      }
      studentId = student.id;

      const { error: signInAError } = await coachAClient.auth.signInWithPassword({
        email: coachAEmail,
        password,
      });
      if (signInAError) throw signInAError;

      const { error: signInBError } = await coachBClient.auth.signInWithPassword({
        email: coachBEmail,
        password,
      });
      if (signInBError) throw signInBError;

      const { data: allowedData, error: allowedError } = await coachAClient
        .from("students")
        .select("id")
        .eq("id", studentId);

      expect(allowedError).toBeNull();
      expect(allowedData ?? []).toHaveLength(1);

      const { data: blockedData, error: blockedError } = await coachBClient
        .from("students")
        .select("id")
        .eq("id", studentId);

      expect(blockedError).toBeNull();
      expect(blockedData ?? []).toHaveLength(0);

      const { data: insertData, error: insertError } = await coachBClient
        .from("students")
        .insert({
          org_id: orgAId,
          first_name: "Hack",
          last_name: "Try",
          email: `hack+${stamp}@example.com`,
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
