-- Profiles: allow org members to read other members in the active workspace
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_org_member_read'
  ) then
    create policy profiles_org_member_read
      on public.profiles
      for select
      to authenticated
      using (
        id = auth.uid()
        or exists (
          select 1
          from public.org_memberships me
          join public.org_memberships other
            on other.org_id = me.org_id
          where me.user_id = auth.uid()
            and me.status = 'active'
            and other.user_id = profiles.id
            and other.status = 'active'
            and public.is_current_workspace(me.org_id)
        )
      );
  end if;
end $$;
