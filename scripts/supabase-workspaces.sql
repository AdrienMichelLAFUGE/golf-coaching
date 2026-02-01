-- Workspaces (personal + org) + memberships + assignments + proposals + notifications

-- Organizations become workspaces
alter table public.organizations
  add column if not exists workspace_type text not null default 'org'
    check (workspace_type in ('personal', 'org')),
  add column if not exists owner_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists billing_interval text not null default 'year'
    check (billing_interval in ('month', 'year')),
  add column if not exists billing_renewal_at timestamp with time zone,
  add column if not exists batch_min_coaches integer not null default 5,
  add column if not exists batch_discount_pct numeric not null default 0;

alter table public.profiles
  add column if not exists premium_active boolean not null default false,
  add column if not exists active_workspace_id uuid references public.organizations(id) on delete set null;

-- Memberships (org)
create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'coach')),
  status text not null check (status in ('invited', 'active', 'disabled')),
  premium_active boolean not null default false,
  invited_email text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint org_memberships_admin_requires_premium
    check (role <> 'admin' or premium_active = true)
);

create unique index if not exists org_memberships_unique
  on public.org_memberships (org_id, user_id);
create index if not exists org_memberships_org_idx
  on public.org_memberships (org_id);
create index if not exists org_memberships_user_idx
  on public.org_memberships (user_id);
create unique index if not exists org_memberships_admin_unique
  on public.org_memberships (org_id)
  where role = 'admin' and status = 'active';

alter table public.org_memberships enable row level security;

-- Invitations (org)
create table if not exists public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'coach')),
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists org_invitations_token_idx
  on public.org_invitations (token);
create index if not exists org_invitations_org_idx
  on public.org_invitations (org_id);

alter table public.org_invitations enable row level security;

-- Student assignments (org)
create table if not exists public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists student_assignments_unique
  on public.student_assignments (student_id, coach_id);
create index if not exists student_assignments_org_idx
  on public.student_assignments (org_id);
create index if not exists student_assignments_coach_idx
  on public.student_assignments (coach_id);

alter table public.student_assignments enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_assignments'
  loop
    execute format('drop policy if exists %I on public.student_assignments', r.policyname);
  end loop;
end $$;

-- Proposals (org)
create table if not exists public.org_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  summary text,
  payload jsonb not null default '{}'::jsonb,
  decided_at timestamp with time zone,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists org_proposals_org_idx
  on public.org_proposals (org_id, status);
create index if not exists org_proposals_student_idx
  on public.org_proposals (student_id);

alter table public.org_proposals enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposals'
  loop
    execute format('drop policy if exists %I on public.org_proposals', r.policyname);
  end loop;
end $$;

create table if not exists public.org_proposal_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.org_proposals(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists org_proposal_comments_proposal_idx
  on public.org_proposal_comments (proposal_id);

alter table public.org_proposal_comments enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposal_comments'
  loop
    execute format(
      'drop policy if exists %I on public.org_proposal_comments',
      r.policyname
    );
  end loop;
end $$;

-- Notifications (org)
create table if not exists public.org_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index if not exists org_notifications_user_idx
  on public.org_notifications (user_id, created_at desc);
create index if not exists org_notifications_org_idx
  on public.org_notifications (org_id, created_at desc);

alter table public.org_notifications enable row level security;

-- Helper functions for RLS
create or replace function public.is_personal_workspace(_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = _org_id
      and o.workspace_type = 'personal'
      and o.owner_profile_id = auth.uid()
  );
$$;

create or replace function public.is_current_workspace(_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.active_workspace_id, p.org_id) = _org_id
  );
$$;

create or replace function public.is_org_member(_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'admin'
  );
$$;

create or replace function public.is_org_coach(_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('admin', 'coach')
  );
$$;

create or replace function public.is_org_premium_member(_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = _org_id
      and o.ai_enabled = true
  );
$$;

create or replace function public.is_assigned_coach(_student_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.student_assignments a
    where a.student_id = _student_id
      and a.coach_id = auth.uid()
  );
$$;

-- Organizations RLS
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
  loop
    execute format('drop policy if exists %I on public.organizations', r.policyname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_workspace_read'
  ) then
    create policy organizations_workspace_read
      on public.organizations
      for select
      to authenticated
      using (
        public.is_personal_workspace(organizations.id)
        or public.is_org_member(organizations.id)
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'student'
            and p.org_id = organizations.id
        )
      );
  end if;
end $$;

-- Org memberships RLS
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_memberships'
      and policyname = 'org_memberships_read'
  ) then
    create policy org_memberships_read
      on public.org_memberships
      for select
      to authenticated
      using (
        user_id = auth.uid()
        or public.is_org_admin(org_memberships.org_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_memberships'
      and policyname = 'org_memberships_admin_write'
  ) then
    create policy org_memberships_admin_write
      on public.org_memberships
      for insert
      to authenticated
      with check (public.is_org_admin(org_memberships.org_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_memberships'
      and policyname = 'org_memberships_admin_update'
  ) then
    create policy org_memberships_admin_update
      on public.org_memberships
      for update
      to authenticated
      using (public.is_org_admin(org_memberships.org_id))
      with check (public.is_org_admin(org_memberships.org_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_memberships'
      and policyname = 'org_memberships_admin_delete'
  ) then
    create policy org_memberships_admin_delete
      on public.org_memberships
      for delete
      to authenticated
      using (public.is_org_admin(org_memberships.org_id));
  end if;
end $$;

-- Invitations RLS
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_invitations'
      and policyname = 'org_invitations_admin_read'
  ) then
    create policy org_invitations_admin_read
      on public.org_invitations
      for select
      to authenticated
      using (public.is_org_admin(org_invitations.org_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_invitations'
      and policyname = 'org_invitations_admin_insert'
  ) then
    create policy org_invitations_admin_insert
      on public.org_invitations
      for insert
      to authenticated
      with check (public.is_org_admin(org_invitations.org_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_invitations'
      and policyname = 'org_invitations_admin_update'
  ) then
    create policy org_invitations_admin_update
      on public.org_invitations
      for update
      to authenticated
      using (public.is_org_admin(org_invitations.org_id))
      with check (public.is_org_admin(org_invitations.org_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_invitations'
      and policyname = 'org_invitations_admin_delete'
  ) then
    create policy org_invitations_admin_delete
      on public.org_invitations
      for delete
      to authenticated
      using (public.is_org_admin(org_invitations.org_id));
  end if;
end $$;

-- Student assignments RLS
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_assignments'
      and policyname = 'student_assignments_read'
  ) then
    create policy student_assignments_read
      on public.student_assignments
      for select
      to authenticated
      using (
        public.is_current_workspace(student_assignments.org_id)
        and public.is_org_member(student_assignments.org_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_assignments'
      and policyname = 'student_assignments_admin_write'
  ) then
    create policy student_assignments_admin_write
      on public.student_assignments
      for insert
      to authenticated
      with check (
        public.is_current_workspace(student_assignments.org_id)
        and public.is_org_admin(student_assignments.org_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_assignments'
      and policyname = 'student_assignments_admin_delete'
  ) then
    create policy student_assignments_admin_delete
      on public.student_assignments
      for delete
      to authenticated
      using (
        public.is_current_workspace(student_assignments.org_id)
        and public.is_org_admin(student_assignments.org_id)
      );
  end if;
end $$;

-- Proposals RLS
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposals'
      and policyname = 'org_proposals_read'
  ) then
    create policy org_proposals_read
      on public.org_proposals
      for select
      to authenticated
      using (
        public.is_current_workspace(org_proposals.org_id)
        and public.is_org_member(org_proposals.org_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposals'
      and policyname = 'org_proposals_insert'
  ) then
    create policy org_proposals_insert
      on public.org_proposals
      for insert
      to authenticated
      with check (
        public.is_current_workspace(org_proposals.org_id)
        and public.is_org_member(org_proposals.org_id)
        and public.is_org_premium_member(org_proposals.org_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposals'
      and policyname = 'org_proposals_no_update'
  ) then
    create policy org_proposals_no_update
      on public.org_proposals
      for update
      to authenticated
      using (false)
      with check (false);
  end if;
end $$;

-- Proposal comments RLS
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposal_comments'
      and policyname = 'org_proposal_comments_read'
  ) then
    create policy org_proposal_comments_read
      on public.org_proposal_comments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.org_proposals p
          where p.id = org_proposal_comments.proposal_id
            and public.is_current_workspace(p.org_id)
            and public.is_org_member(p.org_id)
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_proposal_comments'
      and policyname = 'org_proposal_comments_insert'
  ) then
    create policy org_proposal_comments_insert
      on public.org_proposal_comments
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.org_proposals p
          where p.id = org_proposal_comments.proposal_id
            and public.is_current_workspace(p.org_id)
            and public.is_org_member(p.org_id)
        )
      );
  end if;
end $$;

-- Notifications RLS
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_notifications'
      and policyname = 'org_notifications_read'
  ) then
    create policy org_notifications_read
      on public.org_notifications
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_notifications'
      and policyname = 'org_notifications_no_write'
  ) then
    create policy org_notifications_no_write
      on public.org_notifications
      for insert
      to authenticated
      with check (false);
  end if;
end $$;

-- Students RLS (replace all policies)
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
  loop
    execute format('drop policy if exists %I on public.students', r.policyname);
  end loop;
end $$;

do $$
begin
  create policy students_read
    on public.students
    for select
    to authenticated
    using (
      (
        public.is_current_workspace(students.org_id)
        and public.is_personal_workspace(students.org_id)
      )
      or (
        public.is_current_workspace(students.org_id)
        and public.is_org_member(students.org_id)
      )
      or (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'student'
            and lower(students.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    );
end $$;

do $$
begin
  create policy students_insert
    on public.students
    for insert
    to authenticated
    with check (
      (
        public.is_current_workspace(students.org_id)
        and public.is_personal_workspace(students.org_id)
      )
      or (
        public.is_current_workspace(students.org_id)
        and public.is_org_member(students.org_id)
        and public.is_org_premium_member(students.org_id)
        and public.is_org_coach(students.org_id)
      )
    );
end $$;

do $$
begin
  create policy students_update
    on public.students
    for update
    to authenticated
    using (
      (
        public.is_current_workspace(students.org_id)
        and public.is_personal_workspace(students.org_id)
      )
      or (
        public.is_current_workspace(students.org_id)
        and public.is_org_member(students.org_id)
        and public.is_org_premium_member(students.org_id)
        and public.is_org_coach(students.org_id)
      )
      or (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'student'
            and lower(students.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    )
    with check (
      (
        public.is_current_workspace(students.org_id)
        and public.is_personal_workspace(students.org_id)
      )
      or (
        public.is_current_workspace(students.org_id)
        and public.is_org_member(students.org_id)
        and public.is_org_premium_member(students.org_id)
        and public.is_org_coach(students.org_id)
      )
      or (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'student'
        )
      )
    );
end $$;

do $$
begin
  create policy students_delete
    on public.students
    for delete
    to authenticated
    using (
      (
        public.is_current_workspace(students.org_id)
        and public.is_personal_workspace(students.org_id)
      )
      or (
        public.is_current_workspace(students.org_id)
        and public.is_org_member(students.org_id)
        and public.is_org_premium_member(students.org_id)
        and public.is_org_admin(students.org_id)
      )
    );
end $$;

-- Reports RLS (replace all policies)
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
  loop
    execute format('drop policy if exists %I on public.reports', r.policyname);
  end loop;
end $$;

do $$
begin
  create policy reports_read
    on public.reports
    for select
    to authenticated
    using (
      (
        public.is_current_workspace(reports.org_id)
        and public.is_personal_workspace(reports.org_id)
      )
      or (
        public.is_current_workspace(reports.org_id)
        and public.is_org_member(reports.org_id)
      )
      or exists (
        select 1
        from public.students s
        where s.id = reports.student_id
          and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    );
end $$;

do $$
begin
  create policy reports_write
    on public.reports
    for insert
    to authenticated
    with check (
      (
        public.is_current_workspace(reports.org_id)
        and public.is_personal_workspace(reports.org_id)
      )
      or (
        public.is_current_workspace(reports.org_id)
        and public.is_org_member(reports.org_id)
        and public.is_org_premium_member(reports.org_id)
        and (public.is_org_admin(reports.org_id) or public.is_assigned_coach(reports.student_id))
      )
    );
end $$;

do $$
begin
  create policy reports_update
    on public.reports
    for update
    to authenticated
    using (
      (
        public.is_current_workspace(reports.org_id)
        and public.is_personal_workspace(reports.org_id)
      )
      or (
        public.is_current_workspace(reports.org_id)
        and public.is_org_member(reports.org_id)
        and public.is_org_premium_member(reports.org_id)
        and (public.is_org_admin(reports.org_id) or public.is_assigned_coach(reports.student_id))
      )
    )
    with check (
      (
        public.is_current_workspace(reports.org_id)
        and public.is_personal_workspace(reports.org_id)
      )
      or (
        public.is_current_workspace(reports.org_id)
        and public.is_org_member(reports.org_id)
        and public.is_org_premium_member(reports.org_id)
        and (public.is_org_admin(reports.org_id) or public.is_assigned_coach(reports.student_id))
      )
    );
end $$;

do $$
begin
  create policy reports_delete
    on public.reports
    for delete
    to authenticated
    using (
      (
        public.is_current_workspace(reports.org_id)
        and public.is_personal_workspace(reports.org_id)
      )
      or (
        public.is_current_workspace(reports.org_id)
        and public.is_org_member(reports.org_id)
        and public.is_org_premium_member(reports.org_id)
        and public.is_org_admin(reports.org_id)
      )
    );
end $$;

-- Report sections RLS (replace all policies)
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'report_sections'
  loop
    execute format('drop policy if exists %I on public.report_sections', r.policyname);
  end loop;
end $$;

do $$
begin
  create policy report_sections_read
    on public.report_sections
    for select
    to authenticated
    using (
      (
        public.is_current_workspace(report_sections.org_id)
        and public.is_personal_workspace(report_sections.org_id)
      )
      or (
        public.is_current_workspace(report_sections.org_id)
        and public.is_org_member(report_sections.org_id)
      )
      or exists (
        select 1
        from public.reports r
        join public.students s on s.id = r.student_id
        where r.id = report_sections.report_id
          and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    );
end $$;

do $$
begin
  create policy report_sections_write
    on public.report_sections
    for insert
    to authenticated
    with check (
      (
        public.is_current_workspace(report_sections.org_id)
        and public.is_personal_workspace(report_sections.org_id)
      )
      or exists (
        select 1
        from public.reports r
        where r.id = report_sections.report_id
          and public.is_current_workspace(r.org_id)
          and public.is_org_member(r.org_id)
          and public.is_org_premium_member(r.org_id)
          and (public.is_org_admin(r.org_id) or public.is_assigned_coach(r.student_id))
      )
    );
end $$;

do $$
begin
  create policy report_sections_update
    on public.report_sections
    for update
    to authenticated
    using (
      (
        public.is_current_workspace(report_sections.org_id)
        and public.is_personal_workspace(report_sections.org_id)
      )
      or exists (
        select 1
        from public.reports r
        where r.id = report_sections.report_id
          and public.is_current_workspace(r.org_id)
          and public.is_org_member(r.org_id)
          and public.is_org_premium_member(r.org_id)
          and (public.is_org_admin(r.org_id) or public.is_assigned_coach(r.student_id))
      )
    )
    with check (
      (
        public.is_current_workspace(report_sections.org_id)
        and public.is_personal_workspace(report_sections.org_id)
      )
      or exists (
        select 1
        from public.reports r
        where r.id = report_sections.report_id
          and public.is_current_workspace(r.org_id)
          and public.is_org_member(r.org_id)
          and public.is_org_premium_member(r.org_id)
          and (public.is_org_admin(r.org_id) or public.is_assigned_coach(r.student_id))
      )
    );
end $$;

do $$
begin
  create policy report_sections_delete
    on public.report_sections
    for delete
    to authenticated
    using (
      (
        public.is_current_workspace(report_sections.org_id)
        and public.is_personal_workspace(report_sections.org_id)
      )
      or exists (
        select 1
        from public.reports r
        where r.id = report_sections.report_id
          and public.is_current_workspace(r.org_id)
          and public.is_org_member(r.org_id)
          and public.is_org_premium_member(r.org_id)
          and (public.is_org_admin(r.org_id) or public.is_assigned_coach(r.student_id))
      )
    );
end $$;

-- Backfill memberships for existing orgs
do $$
begin
  insert into public.org_memberships (org_id, user_id, role, status, premium_active)
  select p.org_id,
         p.id,
         case when p.role = 'owner' then 'admin' else 'coach' end,
         'active',
         case when p.role = 'owner' then true else false end
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where o.workspace_type = 'org'
  on conflict (org_id, user_id) do nothing;
end $$;

-- Backfill personal workspaces
do $$
declare
  r record;
  new_org_id uuid;
begin
  for r in
    select p.id, p.full_name
    from public.profiles p
    where not exists (
      select 1 from public.organizations o
      where o.owner_profile_id = p.id and o.workspace_type = 'personal'
    )
  loop
    insert into public.organizations (name, workspace_type, owner_profile_id)
    values (coalesce(r.full_name, 'Espace personnel'), 'personal', r.id)
    returning id into new_org_id;

    insert into public.org_memberships (org_id, user_id, role, status, premium_active)
    values (new_org_id, r.id, 'admin', 'active', true)
    on conflict (org_id, user_id) do nothing;
  end loop;
end $$;

-- Set default active workspace to personal for coaches/owners (students keep org)
do $$
begin
  update public.profiles p
  set active_workspace_id = o.id,
      org_id = o.id
  from public.organizations o
  where o.owner_profile_id = p.id
    and o.workspace_type = 'personal'
    and p.role <> 'student'
    and (p.active_workspace_id is null or p.org_id <> o.id);

  update public.profiles p
  set active_workspace_id = p.org_id
  where p.role = 'student'
    and p.active_workspace_id is null
    and p.org_id is not null;
end $$;

-- Backfill assignments for existing students (assign admin)
do $$
begin
  insert into public.student_assignments (org_id, student_id, coach_id)
  select s.org_id, s.id, m.user_id
  from public.students s
  join public.org_memberships m on m.org_id = s.org_id
  where m.role = 'admin' and m.status = 'active'
  on conflict (student_id, coach_id) do nothing;
end $$;
