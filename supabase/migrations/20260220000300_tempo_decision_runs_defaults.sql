-- Ensure tempo decision runs can be inserted safely with RLS even if coach_id is omitted client-side.

alter table public.tempo_decision_runs
  alter column coach_id set default auth.uid();

create or replace function public.set_tempo_decision_run_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.coach_id is null then
    new.coach_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_tempo_decision_run_defaults on public.tempo_decision_runs;
create trigger set_tempo_decision_run_defaults
before insert on public.tempo_decision_runs
for each row execute function public.set_tempo_decision_run_defaults();

