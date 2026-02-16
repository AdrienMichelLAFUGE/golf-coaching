-- Student event competitive results (V1)

alter table public.student_events
  add column if not exists results_enabled boolean not null default false,
  add column if not exists results_rounds_planned smallint null,
  add column if not exists results_rounds jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_events_results_rounds_planned_check'
  ) then
    alter table public.student_events
      add constraint student_events_results_rounds_planned_check
      check (
        results_rounds_planned is null
        or results_rounds_planned between 1 and 6
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_events_results_shape_check'
  ) then
    alter table public.student_events
      add constraint student_events_results_shape_check
      check (
        jsonb_typeof(results_rounds) = 'array'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_events_results_coherence_check'
  ) then
    alter table public.student_events
      add constraint student_events_results_coherence_check
      check (
        (
          results_enabled = false
          and results_rounds_planned is null
          and jsonb_array_length(results_rounds) = 0
        )
        or (
          results_enabled = true
          and type in ('tournament', 'competition')
          and results_rounds_planned between 1 and 6
          and jsonb_array_length(results_rounds) <= results_rounds_planned
        )
      );
  end if;
end $$;
