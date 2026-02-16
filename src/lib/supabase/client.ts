"use client";

import { createClient } from "@supabase/supabase-js";
import { envClient } from "@/env.client";

const rememberStorageKey = "gc.rememberMe";

const shouldRememberSession = () => {
  if (typeof window === "undefined") return true;
  return window.sessionStorage.getItem(rememberStorageKey) !== "false";
};

const dynamicStorage = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;
    return shouldRememberSession()
      ? window.localStorage.getItem(key)
      : window.sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return;
    if (shouldRememberSession()) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, value);
    window.localStorage.removeItem(key);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(
  envClient.NEXT_PUBLIC_SUPABASE_URL,
  envClient.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: dynamicStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
