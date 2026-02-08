"use client";

import { useEffect, useState } from "react";
import PricingOffersContent, {
  type PricingNotice,
} from "@/components/pricing/PricingOffersContent";
import { pricingPlansSchema, type PricingPlan } from "@/lib/pricing/types";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type PremiumOfferModalProps = {
  open: boolean;
  onClose: () => void;
  notice?: PricingNotice | null;
};

export default function PremiumOfferModal({
  open,
  onClose,
  notice = null,
}: PremiumOfferModalProps) {
  const { planTier, planTierOverrideActive } = useProfile();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");

  useEffect(() => {
    if (!open) return;

    const loadPlans = async () => {
      setLoading(true);
      setError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError("Session invalide. Reconnecte toi.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/pricing", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { plans?: unknown; error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      const parsed = pricingPlansSchema.safeParse(payload.plans ?? []);
      if (!parsed.success) {
        setError("Offres invalides.");
        setPlans([]);
        setLoading(false);
        return;
      }

      setPlans(parsed.data);
      setLoading(false);
    };

    void loadPlans();
  }, [open]);

  const requestBilling = async (
    endpoint: "checkout" | "portal",
    payload?: { interval: "month" | "year" }
  ) => {
    setBillingLoading(true);
    setBillingError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setBillingError("Session invalide. Reconnecte toi.");
      setBillingLoading(false);
      return;
    }

    const response = await fetch(`/api/billing/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setBillingError(data.error ?? "Impossible d ouvrir la page Stripe.");
      setBillingLoading(false);
      return;
    }

    window.location.assign(data.url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 px-4 py-10 backdrop-blur-sm">
      <PricingOffersContent
        variant="app"
        plans={plans}
        loading={loading}
        error={error}
        notice={notice}
        planTier={planTier}
        planTierOverrideActive={planTierOverrideActive}
        onRequestBilling={(endpoint, payload) => {
          void requestBilling(endpoint, payload);
        }}
        billingLoading={billingLoading}
        billingError={billingError}
        onClose={onClose}
      />
    </div>
  );
}

