"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  getWorkspaceEntitlements,
  resolvePlanTier,
  type PlanTier,
  type WorkspaceEntitlements,
} from "@/lib/plans";

export type Profile = {
  id: string;
  org_id: string;
  active_workspace_id?: string | null;
  role: "owner" | "coach" | "staff" | "student";
  full_name: string | null;
  avatar_url?: string | null;
  premium_active?: boolean | null;
};

export type OrganizationSettings = {
  id: string;
  name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  locale: string | null;
  timezone: string | null;
  workspace_type?: "personal" | "org" | null;
  owner_profile_id?: string | null;
  plan_tier?: PlanTier | null;
  ai_enabled: boolean | null;
  tpi_enabled: boolean | null;
  radar_enabled: boolean | null;
  coaching_dynamic_enabled: boolean | null;
  ai_model: string | null;
  ai_tone: string | null;
  ai_tech_level: string | null;
  ai_style: string | null;
  ai_length: string | null;
  ai_imagery: string | null;
  ai_focus: string | null;
};

export type PersonalWorkspace = {
  id: string;
  name: string | null;
  workspace_type: "personal";
  owner_profile_id: string | null;
  plan_tier?: PlanTier | null;
  ai_enabled?: boolean | null;
};

export type WorkspaceMembership = {
  id: string;
  org_id: string;
  role: "admin" | "coach";
  status: "invited" | "active" | "disabled";
  premium_active: boolean;
  organization?: {
    id: string;
    name: string | null;
    workspace_type: "personal" | "org";
    owner_profile_id: string | null;
    plan_tier?: PlanTier | null;
    ai_enabled?: boolean | null;
  } | null;
};

type ProfileState = {
  profile: Profile | null;
  organization: OrganizationSettings | null;
  memberships: WorkspaceMembership[];
  currentMembership: WorkspaceMembership | null;
  workspaceType: "personal" | "org" | null;
  isWorkspaceAdmin: boolean;
  isWorkspacePremium: boolean;
  planTier: PlanTier;
  entitlements: WorkspaceEntitlements;
  userEmail: string | null;
  personalWorkspace: PersonalWorkspace | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [personalWorkspace, setPersonalWorkspace] = useState<PersonalWorkspace | null>(
    null
  );
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    setUserEmail(userData.user?.email ?? null);

    if (!userId) {
      setProfile(null);
      setOrganization(null);
      setPersonalWorkspace(null);
      setUserEmail(null);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, org_id, active_workspace_id, role, full_name, avatar_url, premium_active")
      .eq("id", userId)
      .single();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
      setOrganization(null);
    } else {
      setProfile(profileData);
      const activeWorkspaceId = profileData.active_workspace_id ?? profileData.org_id;
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select(
          "id, name, logo_url, accent_color, locale, timezone, workspace_type, owner_profile_id, plan_tier, ai_enabled, tpi_enabled, radar_enabled, coaching_dynamic_enabled, ai_model, ai_tone, ai_tech_level, ai_style, ai_length, ai_imagery, ai_focus"
        )
        .eq("id", activeWorkspaceId)
        .single();

      if (orgError) {
        setOrganization(null);
      } else {
        setOrganization(orgData);
      }
    }

    if (profileData?.id) {
      const { data: personalData, error: personalError } = await supabase
        .from("organizations")
        .select("id, name, workspace_type, owner_profile_id, plan_tier, ai_enabled")
        .eq("workspace_type", "personal")
        .eq("owner_profile_id", profileData.id)
        .maybeSingle();
      if (personalError) {
        setPersonalWorkspace(null);
      } else {
        setPersonalWorkspace((personalData as PersonalWorkspace | null) ?? null);
      }
      const { data: membershipData } = await supabase
        .from("org_memberships")
        .select(
          "id, org_id, role, status, premium_active, organizations(id, name, workspace_type, owner_profile_id, plan_tier, ai_enabled)"
        )
        .eq("user_id", profileData.id)
        .order("created_at", { ascending: true });
      const mappedMemberships = (membershipData ?? []).map((membership) => {
        const typed = membership as WorkspaceMembership & {
          organizations?:
            | WorkspaceMembership["organization"]
            | WorkspaceMembership["organization"][]
            | null;
        };
        const organizations = Array.isArray(typed.organizations)
          ? typed.organizations[0] ?? null
          : typed.organizations ?? null;
        return {
          ...typed,
          organization: organizations ?? typed.organization ?? null,
        };
      });
      setMemberships(mappedMemberships as WorkspaceMembership[]);
    } else {
      setPersonalWorkspace(null);
      setMemberships([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadProfile();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (organization?.locale && typeof document !== "undefined") {
      document.documentElement.lang = organization.locale;
    }
  }, [organization?.locale]);

  const currentMembership = useMemo(() => {
    const activeWorkspaceId = profile?.active_workspace_id ?? profile?.org_id;
    if (!activeWorkspaceId) return null;
    return (
      memberships.find((membership) => membership.org_id === activeWorkspaceId) ??
      null
    );
  }, [memberships, profile?.active_workspace_id, profile?.org_id]);

  const workspaceType = organization?.workspace_type ?? null;
  const isWorkspaceAdmin = currentMembership?.role === "admin";
  const planTier = resolvePlanTier(organization?.plan_tier);
  const entitlements = getWorkspaceEntitlements(planTier, workspaceType);
  const isWorkspacePremium = planTier !== "free";

  const value = useMemo(
    () => ({
      profile,
      organization,
      memberships,
      currentMembership,
      workspaceType,
      isWorkspaceAdmin,
      isWorkspacePremium,
      planTier,
      entitlements,
      userEmail,
      personalWorkspace,
      loading,
      error,
      refresh: loadProfile,
    }),
    [
      profile,
      organization,
      memberships,
      currentMembership,
      workspaceType,
      isWorkspaceAdmin,
      isWorkspacePremium,
      planTier,
      entitlements,
      userEmail,
      personalWorkspace,
      loading,
      error,
    ]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return context;
}
