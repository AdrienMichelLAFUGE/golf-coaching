"use client";

import { createClient } from "@supabase/supabase-js";
import { envClient } from "@/env.client";

export const supabase = createClient(
  envClient.NEXT_PUBLIC_SUPABASE_URL,
  envClient.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
