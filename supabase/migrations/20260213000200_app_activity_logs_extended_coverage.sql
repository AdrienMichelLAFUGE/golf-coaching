create or replace function public.log_activity_from_table_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor_id uuid;
  log_action text;
  log_message text;
  log_org_id uuid;
  log_entity_id uuid;
  log_metadata jsonb := '{}'::jsonb;
begin
  actor_id := auth.uid();
  if actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'reports' then
    log_org_id := coalesce(new.org_id, old.org_id);
    log_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      if new.sent_at is null then
        log_action := 'report.draft.created';
        log_message := 'Brouillon rapport enregistre.';
      else
        log_action := 'report.published';
        log_message := 'Rapport publie.';
      end if;
    elsif tg_op = 'UPDATE' then
      if old.sent_at is null and new.sent_at is null then
        log_action := 'report.updated';
        log_message := 'Rapport modifie.';
      elsif old.sent_at is null and new.sent_at is not null then
        log_action := 'report.published';
        log_message := 'Rapport publie.';
      else
        log_action := 'report.updated';
        log_message := 'Rapport mis a jour.';
      end if;
    else
      log_action := 'report.deleted';
      log_message := 'Rapport supprime.';
    end if;
  elsif tg_table_name = 'report_sections' then
    log_org_id := coalesce(new.org_id, old.org_id);
    log_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      log_action := 'report.section.created';
      log_message := 'Section rapport ajoutee.';
    elsif tg_op = 'UPDATE' then
      log_action := 'report.section.updated';
      log_message := 'Section rapport modifiee.';
    else
      log_action := 'report.section.deleted';
      log_message := 'Section rapport supprimee.';
    end if;
    log_metadata := jsonb_build_object(
      'reportId', coalesce(new.report_id, old.report_id)
    );
  elsif tg_table_name = 'profiles' then
    log_org_id := coalesce(new.org_id, old.org_id);
    log_entity_id := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and coalesce(new.active_workspace_id::text, '') <> coalesce(old.active_workspace_id::text, '') then
      log_action := 'workspace.switch';
      log_message := 'Workspace actif modifie.';
    elsif tg_op = 'INSERT' then
      log_action := 'profile.created';
      log_message := 'Profil cree.';
    elsif tg_op = 'UPDATE' then
      log_action := 'profile.updated';
      log_message := 'Profil compte modifie.';
    else
      log_action := 'profile.deleted';
      log_message := 'Profil supprime.';
    end if;
  elsif tg_table_name = 'organizations' then
    log_org_id := coalesce(new.id, old.id);
    log_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      log_action := 'organization.created';
      log_message := 'Organisation creee.';
    elsif tg_op = 'UPDATE' then
      log_action := 'organization.updated';
      log_message := 'Organisation modifiee.';
    else
      log_action := 'organization.deleted';
      log_message := 'Organisation supprimee.';
    end if;
  elsif tg_table_name = 'students' then
    log_org_id := coalesce(new.org_id, old.org_id);
    log_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      log_action := 'student.created';
      log_message := 'Eleve cree.';
    elsif tg_op = 'UPDATE' then
      if old.deleted_at is null and new.deleted_at is not null then
        log_action := 'student.deleted';
        log_message := 'Eleve supprime.';
      else
        log_action := 'student.updated';
        log_message := 'Eleve modifie.';
      end if;
    else
      log_action := 'student.deleted';
      log_message := 'Eleve supprime.';
    end if;
  else
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.app_activity_logs (
    level,
    action,
    source,
    actor_user_id,
    org_id,
    entity_type,
    entity_id,
    message,
    metadata
  )
  values (
    'info',
    log_action,
    'db',
    actor_id,
    log_org_id,
    tg_table_name,
    log_entity_id,
    log_message,
    log_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when others then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
end;
$$;

drop trigger if exists log_reports_activity on public.reports;
create trigger log_reports_activity
after insert or update or delete on public.reports
for each row execute function public.log_activity_from_table_changes();

drop trigger if exists log_report_sections_activity on public.report_sections;
create trigger log_report_sections_activity
after insert or update or delete on public.report_sections
for each row execute function public.log_activity_from_table_changes();

drop trigger if exists log_profiles_activity on public.profiles;
create trigger log_profiles_activity
after insert or update or delete on public.profiles
for each row execute function public.log_activity_from_table_changes();

drop trigger if exists log_organizations_activity on public.organizations;
create trigger log_organizations_activity
after insert or update or delete on public.organizations
for each row execute function public.log_activity_from_table_changes();

drop trigger if exists log_students_activity on public.students;
create trigger log_students_activity
after insert or update or delete on public.students
for each row execute function public.log_activity_from_table_changes();
