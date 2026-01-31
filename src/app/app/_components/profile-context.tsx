"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  org_id: string;
  role: "owner" | "coach" | "staff" | "student";
  full_name: string | null;
  avatar_url?: string | null;
};

export type OrganizationSettings = {
  id: string;
  name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  locale: string | null;
  timezone: string | null;
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

type ProfileState = {
  profile: Profile | null;
  organization: OrganizationSettings | null;
  userEmail: string | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
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
      setUserEmail(null);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, org_id, role, full_name, avatar_url")
      .eq("id", userId)
      .single();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
      setOrganization(null);
    } else {
      setProfile(profileData);
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select(
          "id, name, logo_url, accent_color, locale, timezone, ai_enabled, tpi_enabled, radar_enabled, coaching_dynamic_enabled, ai_model, ai_tone, ai_tech_level, ai_style, ai_length, ai_imagery, ai_focus"
        )
        .eq("id", profileData.org_id)
        .single();

      if (orgError) {
        setOrganization(null);
      } else {
        setOrganization(orgData);
      }
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

  const value = useMemo(
    () => ({
      profile,
      organization,
      userEmail,
      loading,
      error,
      refresh: loadProfile,
    }),
    [profile, organization, userEmail, loading, error]
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
