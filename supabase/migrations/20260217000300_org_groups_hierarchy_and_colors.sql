-- Add hierarchy + pastel color tokens to organization groups.
-- This keeps the current workflow while enabling nested sub-groups.

alter table public.org_groups
  add column if not exists parent_group_id uuid references public.org_groups(id) on delete set null;

alter table public.org_groups
  add column if not exists color_token text;

alter table public.org_groups
  add column if not exists display_order integer not null default 0;

alter table public.org_groups
  drop constraint if exists org_groups_parent_self_check;

alter table public.org_groups
  add constraint org_groups_parent_self_check
    check (parent_group_id is null or parent_group_id <> id);

alter table public.org_groups
  drop constraint if exists org_groups_color_token_check;

alter table public.org_groups
  add constraint org_groups_color_token_check
    check (
      color_token is null
      or color_token = any (array['mint', 'sky', 'peach', 'lavender', 'lemon', 'rose'])
    );

create index if not exists org_groups_org_parent_idx
  on public.org_groups (org_id, parent_group_id);

create index if not exists org_groups_org_order_idx
  on public.org_groups (org_id, display_order, created_at);

