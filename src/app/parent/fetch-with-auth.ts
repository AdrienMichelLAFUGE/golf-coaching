"use client";

import { supabase } from "@/lib/supabase/client";

export const fetchParentApi = async (input: string, init?: RequestInit) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Session invalide.");
  }

  return fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
};
