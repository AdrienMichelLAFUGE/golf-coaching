import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

export const createSupabaseServerClient = (authHeader?: string | null) =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader ?? "",
      },
    },
  });

export const createSupabaseServerClientFromRequest = (req: Request) =>
  createSupabaseServerClient(req.headers.get("authorization"));

export const createSupabaseAdminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
