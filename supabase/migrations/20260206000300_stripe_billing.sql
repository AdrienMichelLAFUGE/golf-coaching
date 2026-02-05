-- Stripe billing fields + webhook idempotence

ALTER TABLE public.organizations
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN stripe_subscription_id text,
  ADD COLUMN stripe_price_id text,
  ADD COLUMN stripe_status text,
  ADD COLUMN stripe_current_period_end timestamp with time zone,
  ADD COLUMN stripe_cancel_at_period_end boolean DEFAULT false;

CREATE UNIQUE INDEX organizations_stripe_customer_id_key
  ON public.organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX organizations_stripe_subscription_id_idx
  ON public.organizations (stripe_subscription_id);

CREATE TABLE public.stripe_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  created timestamp with time zone,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  payload_hash text
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
