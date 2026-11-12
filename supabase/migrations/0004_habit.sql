-- ME:LVL — флажок «Привычка» у повтора (задача 13).
-- Правило повтора помечается как привычка; шаблон и его копии несут тот же флажок —
-- по копиям витрина (этап 2) посчитает «положено / выполнено».
-- Существующие повторы — не привычки (default false).

alter table public.repeat_rules add column if not exists is_habit boolean not null default false;
alter table public.tasks        add column if not exists is_habit boolean not null default false;

-- ───────────── Создание копий: копия наследует флажок ─────────────
create or replace function public.generate_repeats_for(p_owner uuid, p_today date)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.repeat_rules;
  t public.tasks;
  nd date;
  nxt date;
  made int := 0;
  cnt int;
begin
  for r in
    select * from public.repeat_rules
    where owner = p_owner and next_date is not null and next_date <= p_today
    for update
  loop
    select * into t from public.tasks where id = r.task_id and deleted_at is null and is_template;
    if not found then continue; end if;

    nd := r.next_date;
    if r.end_date is not null and nd > r.end_date then
      update public.repeat_rules set next_date = null where task_id = r.task_id;
      continue;
    end if;

    if r.kind <> 'after_completion' then
      loop
        nxt := public.repeat_next(r.kind, r.every, r.weekdays, r.month_day, r.anchor_date, nd);
        exit when nxt is null or nxt > p_today or (r.end_date is not null and nxt > r.end_date);
        nd := nxt;
      end loop;
    end if;

    insert into public.tasks (owner, project_id, area_id, title, notes, when_date, when_evening, estimate_min, skill_id,
                              sort_order, today_order, repeat_template_id, repeat_date, is_habit)
    values (t.owner, t.project_id, t.area_id, t.title, t.notes, nd, t.when_evening, t.estimate_min, t.skill_id,
            t.sort_order, extract(epoch from now()), t.id, nd, r.is_habit)
    on conflict (repeat_template_id, repeat_date) where repeat_template_id is not null do nothing;
    get diagnostics cnt = row_count;
    made := made + cnt;

    if r.kind = 'after_completion' then
      nxt := null;
    else
      nxt := public.repeat_next(r.kind, r.every, r.weekdays, r.month_day, r.anchor_date, nd);
      if nxt is not null and r.end_date is not null and nxt > r.end_date then nxt := null; end if;
    end if;
    update public.repeat_rules set next_date = nxt where task_id = r.task_id;
  end loop;
  return made;
end $$;

-- ───────────── Включить / изменить повтор: + флажок привычки ─────────────
-- Старая версия без p_habit удаляется, чтобы у RPC была одна сигнатура.
drop function if exists public.set_repeat(uuid, text, int, text, smallint[], smallint, date, date, date);

create or replace function public.set_repeat(
  p_task uuid, p_kind text, p_every int, p_unit text, p_weekdays smallint[], p_month_day smallint,
  p_start date, p_end date, p_today date, p_habit boolean default false
) returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.tasks where id = p_task and owner = auth.uid()) then
    raise exception 'task not found';
  end if;
  insert into public.repeat_rules (task_id, owner, kind, every, unit, weekdays, month_day, anchor_date, next_date, end_date, is_habit)
  values (p_task, auth.uid(), p_kind, greatest(p_every, 1), p_unit, p_weekdays, p_month_day, p_start,
          public.repeat_first(p_kind, p_every, p_weekdays, p_month_day, p_start), p_end, coalesce(p_habit, false))
  on conflict (task_id) do update set
    kind = excluded.kind, every = excluded.every, unit = excluded.unit, weekdays = excluded.weekdays,
    month_day = excluded.month_day, anchor_date = excluded.anchor_date, next_date = excluded.next_date,
    end_date = excluded.end_date, is_habit = excluded.is_habit;
  update public.tasks set is_template = true, is_habit = coalesce(p_habit, false), when_date = null, someday = false,
                          status = 'open', completed_at = null, logged_at = null
  where id = p_task;
  -- Флажок меняется и у ещё не выполненных копий; выполненные и отменённые не трогаем.
  update public.tasks set is_habit = coalesce(p_habit, false)
  where repeat_template_id = p_task and status = 'open' and deleted_at is null;
  perform public.generate_my_repeats(p_today);
end $$;

-- ───────────── Остановить повтор: флажок пропадает вместе с правилом ─────────────
create or replace function public.stop_repeat(p_task uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from public.repeat_rules where task_id = p_task;
  update public.tasks set is_template = false, is_habit = false where id = p_task;
end $$;

-- ───────────── Права ─────────────
revoke execute on function public.generate_repeats_for(uuid, date) from public, anon, authenticated;
revoke execute on function public.set_repeat(uuid, text, int, text, smallint[], smallint, date, date, date, boolean) from public, anon;
grant execute on function public.set_repeat(uuid, text, int, text, smallint[], smallint, date, date, date, boolean) to authenticated;
