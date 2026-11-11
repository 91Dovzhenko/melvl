-- ME:LVL — схема данных, этап 0.
-- Применить: Supabase → SQL Editor → вставить файл целиком → Run.
-- У каждой строки есть владелец (owner = auth.uid()); RLS — только свои строки.
-- Удаление мягкое: deleted_at (Корзина — этап 3).

create extension if not exists pgcrypto;

-- Общий триггер updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────── Навыки ─────────────
create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  branch      text not null check (branch in ('creator', 'profession')),
  icon        text not null default '',          -- ключ иконки из набора 55 («Компонент · выбор иконки»)
  active      boolean not null default true,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ───────────── Области ─────────────
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '',
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ───────────── Проекты ─────────────
create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  owner               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id             uuid references public.areas(id) on delete set null,
  name                text not null default '',
  notes               text not null default '',
  default_skill_id    uuid references public.skills(id) on delete set null,
  is_quest            boolean not null default false,
  quest_estimate_min  integer check (quest_estimate_min is null or quest_estimate_min >= 0),
  status              text not null default 'open' check (status in ('open', 'completed', 'canceled')),
  completed_at        timestamptz,
  logged_at           timestamptz,                -- перенесён в Журнал
  sort_order          double precision not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- ───────────── Задачи ─────────────
-- Шаблон повтора — задача, у которой есть строка в repeat_rules.
-- Копия повтора — обычная задача с repeat_template_id и repeat_date (день копии).
create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  owner               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete set null,
  area_id             uuid references public.areas(id) on delete set null,
  title               text not null default '',
  notes               text not null default '',
  when_date           date,                       -- «когда»
  when_evening        boolean not null default false,
  someday             boolean not null default false,
  estimate_min        integer check (estimate_min is null or estimate_min >= 0),
  skill_id            uuid references public.skills(id) on delete set null,  -- null = из проекта
  deadline            date,                       -- интерфейс — этап 3
  status              text not null default 'open' check (status in ('open', 'completed', 'canceled')),
  completed_at        timestamptz,
  logged_at           timestamptz,                -- перенесена в Журнал
  sort_order          double precision not null default 0,
  today_order         double precision not null default 0,
  repeat_template_id  uuid references public.tasks(id) on delete set null,
  repeat_date         date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- Дублей копий повтора быть не должно: одна копия шаблона на день.
create unique index tasks_repeat_copy_uniq
  on public.tasks (repeat_template_id, repeat_date)
  where repeat_template_id is not null;

-- ───────────── Правила повтора ─────────────
create table public.repeat_rules (
  task_id        uuid primary key references public.tasks(id) on delete cascade,  -- шаблон
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('after_completion', 'daily', 'weekly', 'monthly')),
  every          integer not null default 1 check (every >= 1),               -- «раз в N»
  unit           text check (unit in ('day', 'week', 'month')),               -- для after_completion
  weekdays       smallint[] check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),  -- 1 = пн … 7 = вс
  month_day      smallint check (month_day between 1 and 31),
  next_date      date,                                                        -- «следующий раз»
  end_date       date,                                                        -- null = никогда
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ───────────── Настройки ─────────────
create table public.settings (
  owner            uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  log_mode         text not null default 'manual' check (log_mode in ('immediately', 'daily', 'manual')),
  today_view       text not null default 'projects' check (today_view in ('projects', 'list')),
  last_auto_log    date,
  updated_at       timestamptz not null default now()
);

-- Индексы
create index on public.skills   (owner);
create index on public.areas    (owner);
create index on public.projects (owner, area_id);
create index on public.tasks    (owner, project_id);
create index on public.tasks    (owner, when_date);
create index on public.tasks    (repeat_template_id);
create index on public.repeat_rules (owner, next_date);

-- updated_at
create trigger t_skills_touch   before update on public.skills       for each row execute function public.touch_updated_at();
create trigger t_areas_touch    before update on public.areas        for each row execute function public.touch_updated_at();
create trigger t_projects_touch before update on public.projects     for each row execute function public.touch_updated_at();
create trigger t_tasks_touch    before update on public.tasks        for each row execute function public.touch_updated_at();
create trigger t_repeat_touch   before update on public.repeat_rules for each row execute function public.touch_updated_at();
create trigger t_settings_touch before update on public.settings     for each row execute function public.touch_updated_at();

-- ───────────── RLS: только свои строки ─────────────
do $$
declare t text;
begin
  foreach t in array array['skills', 'areas', 'projects', 'tasks', 'repeat_rules', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (owner = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (owner = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (owner = auth.uid()) with check (owner = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (owner = auth.uid())', t || '_delete', t);
  end loop;
end $$;

-- ───────────── Первый вход: навыки и настройки по умолчанию ─────────────
-- Вызывается приложением после входа; повторный вызов ничего не меняет.
create or replace function public.init_user() returns void
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.settings (owner) values (auth.uid()) on conflict (owner) do nothing;

  if not exists (select 1 from public.skills where owner = auth.uid()) then
    insert into public.skills (owner, name, branch, icon, sort_order) values
      (auth.uid(), 'Упаковка',             'creator',    'frame', 1),
      (auth.uid(), 'Сценарий',             'creator',    'pencil',    2),
      (auth.uid(), 'Речь на камеру',       'creator',    'mic',    3),
      (auth.uid(), 'Съёмка',               'creator',    'video',  4),
      (auth.uid(), 'Монтаж',               'creator',    'scissors',   5),
      (auth.uid(), 'Маркетинг',            'creator',    'megaphone', 6),
      (auth.uid(), 'ИИ и агентные системы','creator',    'sparkles',        7),
      (auth.uid(), 'Продукт',              'profession', 'cube',   8),
      (auth.uid(), 'Внедрение ИИ',         'profession', 'gear',   9),
      (auth.uid(), 'Финансы',              'profession', 'chart',  10);
  end if;
end $$;

revoke execute on function public.init_user() from public, anon;
grant execute on function public.init_user() to authenticated;

-- ───────────── Права Data API ─────────────
-- Проект создан с выключенным «Automatically expose new tables»: права выдаются явно.
-- Анонимам — ничего; вошедшему пользователю — свои строки (ограничивает RLS выше).
revoke all on public.skills, public.areas, public.projects, public.tasks, public.repeat_rules, public.settings from anon;
grant select, insert, update, delete
  on public.skills, public.areas, public.projects, public.tasks, public.repeat_rules, public.settings
  to authenticated;

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table
  public.skills, public.areas, public.projects, public.tasks, public.repeat_rules, public.settings;
