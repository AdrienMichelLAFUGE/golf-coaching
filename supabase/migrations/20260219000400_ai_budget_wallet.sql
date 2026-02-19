-- Coach-level IA budget in EUR cents + monthly topups.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_budget_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_budget_monthly_cents integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_ai_budget_monthly_cents_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_ai_budget_monthly_cents_check
      CHECK (ai_budget_monthly_cents IS NULL OR ai_budget_monthly_cents > 0);
  END IF;
END
$$;

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS cost_eur_cents integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_usage_cost_eur_cents_check'
      AND conrelid = 'public.ai_usage'::regclass
  ) THEN
    ALTER TABLE public.ai_usage
      ADD CONSTRAINT ai_usage_cost_eur_cents_check
      CHECK (cost_eur_cents >= 0);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.ai_credit_topups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  month_key text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ai_credit_topups_pkey PRIMARY KEY (id),
  CONSTRAINT ai_credit_topups_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT ai_credit_topups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT ai_credit_topups_amount_cents_check CHECK (amount_cents > 0),
  CONSTRAINT ai_credit_topups_month_key_check CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS ai_credit_topups_profile_month_idx
  ON public.ai_credit_topups(profile_id, month_key);

ALTER TABLE public.ai_credit_topups ENABLE ROW LEVEL SECURITY;
