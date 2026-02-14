alter table if exists public.message_thread_members
  add column if not exists hidden_at timestamptz;

create index if not exists message_thread_members_user_hidden_idx
  on public.message_thread_members (user_id, hidden_at, thread_id);
