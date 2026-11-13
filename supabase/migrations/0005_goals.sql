-- ME:LVL — этап 2: «Цели» и «Персонаж» (15_ТЗ, раздел 3).
-- Применить: Supabase → SQL Editor → вставить файл целиком → Run.
-- Цели, ступени и замеры — новые таблицы; у каждой строки владелец (owner = auth.uid()), RLS — только свои строки.
-- Удаление мягкое: deleted_at. Числа — numeric (доход может быть дробным).
-- Часы, уровни, главы и моменты не хранятся — считаются в приложении (src/lib/growth).
-- Существующие данные не меняются.

-- ───────────── Цели ─────────────
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null default '',
  metric        text not null default '',          -- метрика, она же единица («подписчики», «₽ с контента/мес»)
  start_value   numeric not null default 0,
  target_value  numeric not null default 0,
  criterion     text not null default '',          -- критерий достижения, текстом
  calc          text not null default 'once' check (calc in ('once', 'average')),
  period_n      integer not null default 3 check (period_n >= 1),
  period_unit   text not null default 'month' check (period_unit in ('week', 'month')),
  due_date      date,                              -- ориентировочный срок, необязателен
  review_date   date,                              -- дата пересмотра
  status        text not null default 'active' check (status in ('active', 'paused', 'canceled', 'achieved')),
  achieved_at   date,                              -- когда отмечена достигнутой
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ───────────── Ступени ─────────────
-- Лестница по sort_order снизу вверх; последняя ступень — сама цель.
create table public.goal_steps (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id       uuid not null references public.goals(id) on delete cascade,
  title         text not null default '',
  threshold     numeric not null default 0,
  calc          text not null default 'goal' check (calc in ('goal', 'once', 'average')),  -- 'goal' = как у цели
  taken_at      date,                              -- взята (дата замера) или пусто
  taken_manual  boolean not null default false,    -- статус поправлен вручную в форме цели
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ───────────── Замеры ─────────────
create table public.goal_measurements (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id       uuid not null references public.goals(id) on delete cascade,
  date          date not null,                     -- всегда из формы (локальный день); без default: current_date в базе — по UTC
  value         numeric not null,
  comment       text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ───────────── Настройки ─────────────
alter table public.settings add column if not exists character_seen_at timestamptz;  -- последнее открытие «Персонажа» (точка-бейдж)
alter table public.settings add column if not exists tree_layout jsonb;              -- застывшая раскладка дерева навыков (Mac)

-- Индексы
create index on public.goals             (owner);
create index on public.goal_steps        (owner, goal_id);
create index on public.goal_measurements (owner, goal_id, date);

-- updated_at
create trigger t_goals_touch        before update on public.goals             for each row execute function public.touch_updated_at();
create trigger t_goal_steps_touch   before update on public.goal_steps        for each row execute function public.touch_updated_at();
create trigger t_goal_meas_touch    before update on public.goal_measurements for each row execute function public.touch_updated_at();

-- ───────────── RLS: только свои строки ─────────────
do $$
declare t text;
begin
  foreach t in array array['goals', 'goal_steps', 'goal_measurements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (owner = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (owner = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (owner = auth.uid()) with check (owner = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (owner = auth.uid())', t || '_delete', t);
  end loop;
end $$;

-- ───────────── Права Data API ─────────────
-- Как в 0001: анонимам — ничего, вошедшему — свои строки (ограничивает RLS).
revoke all on public.goals, public.goal_steps, public.goal_measurements from anon;
grant select, insert, update, delete
  on public.goals, public.goal_steps, public.goal_measurements
  to authenticated;

-- ───────────── Realtime (синхронизация Mac ↔ iPhone) ─────────────
alter publication supabase_realtime add table
  public.goals, public.goal_steps, public.goal_measurements;
