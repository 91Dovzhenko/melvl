-- ME:LVL — повторы (п. 5 сборки, раздел 7 ТЗ).
-- Применить: Supabase → SQL Editor → вставить файл целиком → Run.
--
-- Шаблон — задача с is_template = true и строкой в repeat_rules; в списках не показывается.
-- Копия — обычная задача с repeat_template_id и repeat_date. Одна копия шаблона на день (уникальный индекс из 0001).
-- Копии создаёт generate_repeats_for(): её вызывает приложение при открытии (generate_my_repeats)
-- и расписание pg_cron каждый день в 00:05 по Москве (0003_repeats_cron.sql).

alter table public.tasks add column if not exists is_template boolean not null default false;
alter table public.repeat_rules add column if not exists anchor_date date;  -- день отсчёта: неделя / месяц «раз в N»

-- ───────────── Расчёт дат ─────────────

-- Следующая дата повтора строго после p_after (по дням / неделям / месяцам).
create or replace function public.repeat_next(
  p_kind text, p_every int, p_weekdays smallint[], p_month_day smallint, p_anchor date, p_after date
) returns date language plpgsql immutable set search_path = public as $$
declare
  d date;
  e int := greatest(coalesce(p_every, 1), 1);
  anchor date := coalesce(p_anchor, p_after);
  k int;
  m date;
  cand date;
begin
  if p_kind = 'daily' then
    return p_after + e;

  elsif p_kind = 'weekly' then
    if p_weekdays is null or coalesce(array_length(p_weekdays, 1), 0) = 0 then return null; end if;
    d := p_after + 1;
    for i in 1 .. (7 * e + 7) loop
      if extract(isodow from d)::int = any (p_weekdays::int[])
         and ((((date_trunc('week', d)::date - date_trunc('week', anchor)::date) / 7) % e) + e) % e = 0 then
        return d;
      end if;
      d := d + 1;
    end loop;
    return null;

  elsif p_kind = 'monthly' then
    if p_month_day is null then return null; end if;
    -- Месяцы отсчёта: месяц anchor + k·e; число — month_day или последний день месяца.
    k := greatest(0, ((extract(year from p_after)::int * 12 + extract(month from p_after)::int)
                    - (extract(year from anchor)::int * 12 + extract(month from anchor)::int)) / e - 1);
    for i in 1 .. 4 loop
      m := (date_trunc('month', anchor) + make_interval(months => (k + i - 1) * e))::date;
      cand := m + (least(p_month_day::int, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1);
      if cand > p_after then return cand; end if;
    end loop;
    return null;
  end if;

  return null;
end $$;

-- Первая дата повтора, не раньше p_start.
create or replace function public.repeat_first(
  p_kind text, p_every int, p_weekdays smallint[], p_month_day smallint, p_start date
) returns date language sql immutable set search_path = public as $$
  select case
    when p_kind in ('after_completion', 'daily') then p_start
    else public.repeat_next(p_kind, p_every, p_weekdays, p_month_day, p_start, p_start - 1)
  end
$$;

-- ───────────── Создание копий ─────────────

-- Для каждого правила с next_date <= p_today создаёт копию на её день.
-- Пропущенные дни не множатся: из нескольких прошедших дат берётся последняя, не позже сегодня.
-- «После выполнения»: одна копия, следующая дата появится, когда копию отметят (триггер ниже).
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
                              sort_order, today_order, repeat_template_id, repeat_date)
    values (t.owner, t.project_id, t.area_id, t.title, t.notes, nd, t.when_evening, t.estimate_min, t.skill_id,
            t.sort_order, extract(epoch from now()), t.id, nd)
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

-- Вызывает приложение при открытии: копии на сегодня для вошедшего пользователя (день — по устройству).
create or replace function public.generate_my_repeats(p_today date)
returns int language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return public.generate_repeats_for(auth.uid(), p_today);
end $$;

-- Вызывает расписание: все пользователи, сегодня по Москве.
create or replace function public.generate_repeats_all()
returns int language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  made int := 0;
begin
  for o in select distinct owner from public.repeat_rules where next_date is not null loop
    made := made + public.generate_repeats_for(o, (now() at time zone 'Europe/Moscow')::date);
  end loop;
  return made;
end $$;

-- ───────────── Включить / изменить / остановить повтор ─────────────

-- Задача становится шаблоном (или шаблон получает новое правило). Первая дата — не раньше p_start.
create or replace function public.set_repeat(
  p_task uuid, p_kind text, p_every int, p_unit text, p_weekdays smallint[], p_month_day smallint,
  p_start date, p_end date, p_today date
) returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.tasks where id = p_task and owner = auth.uid()) then
    raise exception 'task not found';
  end if;
  insert into public.repeat_rules (task_id, owner, kind, every, unit, weekdays, month_day, anchor_date, next_date, end_date)
  values (p_task, auth.uid(), p_kind, greatest(p_every, 1), p_unit, p_weekdays, p_month_day, p_start,
          public.repeat_first(p_kind, p_every, p_weekdays, p_month_day, p_start), p_end)
  on conflict (task_id) do update set
    kind = excluded.kind, every = excluded.every, unit = excluded.unit, weekdays = excluded.weekdays,
    month_day = excluded.month_day, anchor_date = excluded.anchor_date, next_date = excluded.next_date,
    end_date = excluded.end_date;
  update public.tasks set is_template = true, when_date = null, someday = false,
                          status = 'open', completed_at = null, logged_at = null
  where id = p_task;
  perform public.generate_my_repeats(p_today);
end $$;

-- Остановить повтор: шаблон становится обычной задачей, уже созданные копии остаются.
create or replace function public.stop_repeat(p_task uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from public.repeat_rules where task_id = p_task;
  update public.tasks set is_template = false where id = p_task;
end $$;

-- ───────────── «После выполнения»: следующая копия — через интервал от дня выполнения ─────────────
create or replace function public.on_repeat_copy_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.repeat_rules;
  done date;
  nd date;
begin
  if new.repeat_template_id is null or new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  select * into r from public.repeat_rules where task_id = new.repeat_template_id;
  if not found or r.kind <> 'after_completion' then return new; end if;
  done := (coalesce(new.completed_at, now()) at time zone 'Europe/Moscow')::date;
  nd := case coalesce(r.unit, 'day')
          when 'week' then done + 7 * r.every
          when 'month' then (done + make_interval(months => r.every))::date
          else done + r.every
        end;
  if r.end_date is not null and nd > r.end_date then nd := null; end if;
  update public.repeat_rules set next_date = nd where task_id = r.task_id;
  return new;
end $$;

drop trigger if exists t_repeat_copy_completed on public.tasks;
create trigger t_repeat_copy_completed after update of status on public.tasks
  for each row execute function public.on_repeat_copy_completed();

-- ───────────── Права ─────────────
revoke execute on function public.generate_repeats_for(uuid, date) from public, anon, authenticated;
revoke execute on function public.generate_repeats_all() from public, anon, authenticated;
revoke execute on function public.generate_my_repeats(date) from public, anon;
revoke execute on function public.set_repeat(uuid, text, int, text, smallint[], smallint, date, date, date) from public, anon;
revoke execute on function public.stop_repeat(uuid) from public, anon;
grant execute on function public.generate_my_repeats(date) to authenticated;
grant execute on function public.set_repeat(uuid, text, int, text, smallint[], smallint, date, date, date) to authenticated;
grant execute on function public.stop_repeat(uuid) to authenticated;
-- Чистый расчёт дат без доступа к данным — открыт, чтобы сверять с расчётом в приложении.
grant execute on function public.repeat_next(text, int, smallint[], smallint, date, date) to anon, authenticated;
grant execute on function public.repeat_first(text, int, smallint[], smallint, date) to anon, authenticated;
