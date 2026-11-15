-- ME:LVL — этап 2.1 (17_ТЗ): «Без навыка» у задачи и новые задачи в «Сегодня».
-- Применить: Supabase → SQL Editor → вставить файл целиком → Run.
-- Существующие данные: no_skill = false у всех задач; точек у старых задач после миграции нет (today_ack_at = now()).

-- ───────────── П. 7. «Без навыка» явно ─────────────
-- Три состояния навыка задачи: как у проекта (skill_id пусто, no_skill = false) · без навыка (no_skill = true) · свой (skill_id).
alter table public.tasks add column if not exists no_skill boolean not null default false;
alter table public.tasks drop constraint if exists tasks_no_skill_chk;
alter table public.tasks add constraint tasks_no_skill_chk check (not no_skill or skill_id is null);

-- ───────────── П. 9. Новые задачи в «Сегодня» ─────────────
-- when_set_at — когда задаче поставили текущую дату «Когда». Задача «пришла сама», если её дата сегодня,
--   а поставлена она была до сегодняшнего дня (дата наступила), или это копия повтора, созданная сегодня (created_at).
-- new_seen_at — когда задачу открыли (точка у неё гаснет).
-- settings.today_ack_at — когда нажали «OK» на плашке «Новые задачи» (гаснут все точки, пришедшие раньше).
alter table public.tasks    add column if not exists when_set_at timestamptz;
alter table public.tasks    add column if not exists new_seen_at timestamptz;
alter table public.settings add column if not exists today_ack_at timestamptz;

-- Существующие задачи с датой: дата считается поставленной в момент последней правки строки.
update public.tasks set when_set_at = coalesce(updated_at, created_at)
where when_date is not null and when_set_at is null;
-- Всё, что уже лежит в «Сегодня», — не новое: как будто «OK» нажат в момент миграции.
update public.settings set today_ack_at = now() where today_ack_at is null;

-- Дата «Когда» поменялась (или задача создана с датой) — запоминаем когда.
-- Приложение пишет when_set_at само; триггер — для всех остальных записей (копии повторов из расписания и т. п.).
create or replace function public.tasks_when_set_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.when_date is not null and new.when_set_at is null then new.when_set_at := now(); end if;
  elsif new.when_date is distinct from old.when_date then
    new.when_set_at := case when new.when_date is null then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists t_tasks_when_set_at on public.tasks;
create trigger t_tasks_when_set_at before insert or update of when_date on public.tasks
  for each row execute function public.tasks_when_set_at();

-- ───────────── Копии повторов наследуют «Без навыка» ─────────────
-- Та же функция, что в 0004, плюс no_skill шаблона в копии.
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
                              no_skill, sort_order, today_order, repeat_template_id, repeat_date, is_habit)
    values (t.owner, t.project_id, t.area_id, t.title, t.notes, nd, t.when_evening, t.estimate_min, t.skill_id,
            t.no_skill, t.sort_order, extract(epoch from now()), t.id, nd, r.is_habit)
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
