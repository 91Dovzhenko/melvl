import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Area = { id: string; name: string; sort_order: number };
export type Project = {
  id: string; area_id: string | null; name: string; is_quest: boolean;
  status: 'open' | 'completed' | 'canceled'; logged_at: string | null; sort_order: number;
};
export type TaskLite = {
  id: string; project_id: string | null; area_id: string | null; status: 'open' | 'completed' | 'canceled';
  when_date: string | null; someday: boolean; logged_at: string | null;
};

export type ShellData = {
  areas: Area[];
  projects: Project[];
  tasks: TaskLite[];
  loading: boolean;
  error: string | null;
};

/** «Сегодня» — локальная дата устройства, YYYY-MM-DD. */
export function todayISO(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function useShellData(enabled: boolean): ShellData & { reload: () => void } {
  const [data, setData] = useState<ShellData>({ areas: [], projects: [], tasks: [], loading: true, error: null });

  const load = useCallback(async () => {
    if (!supabase || !enabled) return;
    // Первый вход: стартовые навыки и настройки (повторный вызов ничего не меняет).
    const init = await supabase.rpc('init_user');
    const [a, p, t] = await Promise.all([
      supabase.from('areas').select('id,name,sort_order').is('deleted_at', null).order('sort_order'),
      supabase.from('projects').select('id,area_id,name,is_quest,status,logged_at,sort_order')
        .is('deleted_at', null).is('logged_at', null).neq('status', 'canceled').order('sort_order'),
      supabase.from('tasks').select('id,project_id,area_id,status,when_date,someday,logged_at')
        .is('deleted_at', null).is('logged_at', null),
    ]);
    const err = init.error || a.error || p.error || t.error;
    setData({
      areas: (a.data as Area[]) ?? [],
      projects: (p.data as Project[]) ?? [],
      tasks: (t.data as TaskLite[]) ?? [],
      loading: false,
      error: err ? err.message : null,
    });
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  return { ...data, reload: load };
}

/** Доля выполненных задач проекта от всех (без отменённых и удалённых). */
export function projectProgress(projectId: string, tasks: TaskLite[]) {
  const own = tasks.filter((t) => t.project_id === projectId && t.status !== 'canceled');
  if (own.length === 0) return 0;
  return own.filter((t) => t.status === 'completed').length / own.length;
}

export function counts(tasks: TaskLite[]) {
  const today = todayISO();
  const open = tasks.filter((t) => t.status === 'open');
  return {
    inbox: open.filter((t) => !t.project_id && !t.area_id && !t.when_date && !t.someday).length,
    today: open.filter((t) => t.when_date !== null && t.when_date <= today).length,
  };
}

/** Только для локального просмотра каркаса без входа (npm run dev, ?preview). Данные выдуманные. */
export const PREVIEW_DATA: ShellData = {
  areas: [
    { id: 'a1', name: 'Работа', sort_order: 1 },
    { id: 'a2', name: 'Учёба', sort_order: 2 },
  ],
  projects: [
    { id: 'p1', area_id: 'a1', name: 'Запуск нового лендинга', is_quest: false, status: 'open', logged_at: null, sort_order: 1 },
    { id: 'p2', area_id: 'a1', name: 'Квартальный отчёт для команды с очень длинным названием', is_quest: true, status: 'open', logged_at: null, sort_order: 2 },
    { id: 'p3', area_id: 'a2', name: 'Курс по рисованию', is_quest: false, status: 'completed', logged_at: null, sort_order: 1 },
  ],
  tasks: [
    { id: 't1', project_id: 'p1', area_id: null, status: 'completed', when_date: null, someday: false, logged_at: null },
    { id: 't2', project_id: 'p1', area_id: null, status: 'open', when_date: todayISO(), someday: false, logged_at: null },
    { id: 't3', project_id: null, area_id: null, status: 'open', when_date: null, someday: false, logged_at: null },
  ],
  loading: false,
  error: null,
};
