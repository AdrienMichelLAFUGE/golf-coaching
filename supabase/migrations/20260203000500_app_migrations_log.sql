-- Track application migrations applied via scripts.

CREATE TABLE IF NOT EXISTS public.app_migrations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version text NOT NULL,
    name text NOT NULL,
    filename text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    applied_by text NOT NULL DEFAULT current_user
);

CREATE UNIQUE INDEX IF NOT EXISTS app_migrations_filename_key
    ON public.app_migrations (filename);

CREATE INDEX IF NOT EXISTS app_migrations_applied_at_idx
    ON public.app_migrations (applied_at DESC);

ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
