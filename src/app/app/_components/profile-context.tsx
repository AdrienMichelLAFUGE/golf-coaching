"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Profile = {
  id: string;
  org_id: string;
  role: "owner" | "coach" | "staff" | "student";
  full_name: string | null;
};

export type OrganizationSettings = {
  id: string;
  name: string | null;
  accent_color: string | null;
  locale: string | null;
  timezone: string | null;
};

type ProfileState = {
  profile: Profile | null;
  organization: OrganizationSettings | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] =
    useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setProfile(null);
      setOrganization(null);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, org_id, role, full_name")
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
        .select("id, name, accent_color, locale, timezone")
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
    loadProfile();
  }, []);

  useEffect(() => {
    if (organization?.locale && typeof document !== "undefined") {
      document.documentElement.lang = organization.locale;
    }
  }, [organization?.locale]);

  const value = useMemo(
    () => ({ profile, organization, loading, error, refresh: loadProfile }),
    [profile, organization, loading, error]
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return context;
}
