"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    let active = true;

    const completeSignIn = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setMessage("Sign-in failed. Please try again.");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        router.replace("/app");
        return;
      }

      setMessage("No session found. Please request a new magic link.");
    };

    completeSignIn();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-900">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Almost there</h1>
        <p className="mt-3 text-sm text-zinc-700">{message}</p>
      </div>
    </main>
  );
}
