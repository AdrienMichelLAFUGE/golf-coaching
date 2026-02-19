-- Enable IA budget quota by default for coach-like accounts.

ALTER TABLE public.profiles
  ALTER COLUMN ai_budget_enabled SET DEFAULT true;

UPDATE public.profiles
SET ai_budget_enabled = true
WHERE ai_budget_enabled = false
  AND role IN ('owner', 'coach', 'staff');
