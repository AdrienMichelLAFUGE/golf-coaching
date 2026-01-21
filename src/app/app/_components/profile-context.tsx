"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Profile = {
  id: string;
  org_id: string;
  role: "owner" | "coach" | "staff" | "student";
  full_name: string | null;
};

type ProfileState = {
  profile: Profile | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, org_id, role, full_name")
      .eq("id", userId)
      .single();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
    } else {
      setProfile(data);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const value = useMemo(
    () => ({ profile, loading, error, refresh: loadProfile }),
    [profile, loading, error]
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
