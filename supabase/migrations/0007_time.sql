-- ME:LVL — этап 5: раздел «Время», учёт времени по 30-минутным слотам (21_ТЗ, раздел 3).
-- Применить: Supabase → SQL Editor → вставить файл целиком → Run.
-- Новые таблицы: категории, направления, этапы, слоты, рабочие дни недели. У каждой строки владелец
-- (owner = auth.uid()), RLS — только свои строки. Справочники удаляются мягко (deleted_at), слоты — по-настоящему:
-- пустой слот = строки нет.
-- Блоки, суммы, «Последние», план, отклонения, месячная норма, сравнение проектов не хранятся — считаются
-- в приложении (src/lib/time). История из таблицы не переносится. Существующие данные не меняются.

-- ───────────── Категории ─────────────
create table public.time_categories (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '',
  color       text not null default 'graphite'   -- ключ палитры (src/lib/time/palette.ts)
              check (color in ('violet', 'sky', 'apricot', 'sage', 'ochre', 'terracotta', 'blue', 'rose', 'teal', 'graphite')),
  status      text not null default 'active' check (status in ('active', 'archived')),
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ───────────── Направления ─────────────
-- Норма: none — нет; daily — norm_min в рабочий день (по графику недели); monthly — norm_min в месяц.
-- area_id — область задач: на шаге «Проект» предлагаются только её открытые проекты (необязательно).
create table public.time_directions (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id  uuid not null references public.time_categories(id),
  name         text not null default '',
  status       text not null default 'active' check (status in ('active', 'archived')),
  norm_type    text not null default 'none' check (norm_type in ('none', 'daily', 'monthly')),
  norm_min     integer not null default 0 check (norm_min >= 0),
  area_id      uuid references public.areas(id) on delete set null,
  sort_order   double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  -- Для составного ключа из слотов: направление принадлежит категории.
  unique (id, category_id)
);

-- ───────────── Этапы (у направления) ─────────────
create table public.time_stages (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction_id  uuid not null references public.time_directions(id),
  name          text not null default '',
  status        text not null default 'active' check (status in ('active', 'archived')),
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (id, direction_id)
);

-- ───────────── Слоты ─────────────
-- Один слот = 30 мин дня по Москве: slot 0 = 00:00–00:30 … 47 = 23:30–24:00. Ключ — (owner, date, slot).
-- Проверки: направление принадлежит категории, этап — направлению (составные внешние ключи),
-- этап — только с направлением (что этап только вместе с проектом — проверяет приложение). Перенос направления в другую категорию меняет category_id
-- у его слотов в той же транзакции (on update cascade).
create table public.time_slots (
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          date not null,
  slot          smallint not null check (slot between 0 and 47),
  category_id   uuid not null references public.time_categories(id),
  direction_id  uuid,
  project_id    uuid references public.projects(id) on delete set null,   -- проект задач
  stage_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (owner, date, slot),
  foreign key (direction_id, category_id) references public.time_directions(id, category_id) on update cascade,
  foreign key (stage_id, direction_id)    references public.time_stages(id, direction_id),
  -- Этап — только с направлением. «Этап только вместе с проектом» держит приложение (окно отметки и запись):
  -- иначе настоящее удаление проекта (on delete set null) упёрлось бы в эту проверку.
  check (stage_id is null or direction_id is not null)
);

-- ───────────── Рабочие дни недели ─────────────
-- Только для направлений с нормой daily. days — маска: 7 бит, пн = бит 0.
-- Неделя без своей строки берёт маску последней более ранней недели направления (считает приложение).
create table public.time_week_schedules (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction_id  uuid not null references public.time_directions(id) on delete cascade,
  week_start    date not null check (extract(isodow from week_start) = 1),   -- понедельник
  days          smallint not null default 0 check (days between 0 and 127),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (direction_id, week_start)
);

-- ───────────── Настройки ─────────────
alter table public.settings add column if not exists time_summary_tables jsonb;  -- «Сводка»: [{kind:'direction'|'category', id}] по порядку
alter table public.settings add column if not exists time_projects_pick  jsonb;  -- «Проекты»: {direction_id: [project_id, …]} (не больше 4)

-- Индексы
create index on public.time_categories     (owner);
create index on public.time_directions     (owner, category_id);
create index on public.time_stages         (owner, direction_id);
create index on public.time_slots          (owner, direction_id, date);
create index on public.time_slots          (owner, category_id, date);
create index on public.time_slots          (owner, project_id);
create index on public.time_slots          (owner, updated_at desc);
create index on public.time_week_schedules (owner, direction_id, week_start);

-- updated_at
create trigger t_time_categories_touch before update on public.time_categories     for each row execute function public.touch_updated_at();
create trigger t_time_directions_touch before update on public.time_directions     for each row execute function public.touch_updated_at();
create trigger t_time_stages_touch     before update on public.time_stages         for each row execute function public.touch_updated_at();
create trigger t_time_slots_touch      before update on public.time_slots          for each row execute function public.touch_updated_at();
create trigger t_time_weeks_touch      before update on public.time_week_schedules for each row execute function public.touch_updated_at();

-- ───────────── RLS: только свои строки ─────────────
do $$
declare t text;
begin
  foreach t in array array['time_categories', 'time_directions', 'time_stages', 'time_slots', 'time_week_schedules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (owner = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (owner = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (owner = auth.uid()) with check (owner = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (owner = auth.uid())', t || '_delete', t);
  end loop;
end $$;

-- ───────────── Права Data API ─────────────
-- Как в 0001: анонимам — ничего, вошедшему — свои строки (ограничивает RLS).
revoke all on public.time_categories, public.time_directions, public.time_stages, public.time_slots, public.time_week_schedules from anon;
grant select, insert, update, delete
  on public.time_categories, public.time_directions, public.time_stages, public.time_slots, public.time_week_schedules
  to authenticated;

-- ───────────── Realtime (синхронизация Mac ↔ iPhone) ─────────────
-- У слотов ключ (owner, date, slot): в событии удаления приходят именно эти поля.
alter publication supabase_realtime add table
  public.time_categories, public.time_directions, public.time_stages, public.time_slots, public.time_week_schedules;
