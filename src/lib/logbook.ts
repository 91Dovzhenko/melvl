import { useCallback, useEffect } from 'react';
import { useStore, useToday } from './store';
import { iso } from './dates';
import type { Project, Task } from './types';

const nowISO = () => new Date().toISOString();
/** Локальная дата выполнения (YYYY-MM-DD). */
export const doneDay = (at: string | null) => (at ? iso(new Date(at)) : '');

/**
 * Перенос в Журнал. Переносятся выполненные задачи и завершённые проекты (с их задачами).
 * Отменённые задачи в Журнал не идут. `before` — переносить только выполненное раньше этой даты (режим «раз в день»).
 */
export function useLogbook() {
  const store = useStore();
  const logNow = useCallback((before?: string, silent?: boolean) => {
    const at = nowISO();
    const doneBefore = (x: { completed_at: string | null }) => !before || (x.completed_at !== null && doneDay(x.completed_at) < before);
    const projects = store.projects.filter((p) => p.status === 'completed' && !p.logged_at && doneBefore(p));
    const projectIds = new Set(projects.map((p) => p.id));
    const tasks = store.tasks.filter((t) => !t.logged_at && !t.deleted_at && (
      (t.status === 'completed' && doneBefore(t)) ||
      (t.project_id !== null && projectIds.has(t.project_id) && t.status !== 'open')
    ));
    const n = tasks.filter((t) => t.status === 'completed').length + projects.length;
    if (!tasks.length && !projects.length) {
      if (!silent) store.toast('Нечего переносить в Журнал');
      return 0;
    }
    const run = () => {
      for (const t of tasks) store.patch('tasks', t.id, { logged_at: at });
      for (const p of projects) store.patch('projects', p.id, { logged_at: at });
    };
    if (silent) run();
    else store.withUndo(`В Журнал: ${n}`, run);
    return n;
  }, [store]);
  return { logNow };
}

/** Режим «раз в день»: всё, выполненное до сегодняшнего дня, переносится само (при открытии и после полуночи). */
export function useAutoLog() {
  const store = useStore();
  const today = useToday();
  const { logNow } = useLogbook();
  const mode = store.settings.log_mode;
  const pending = store.tasks.some((t) => t.status === 'completed' && !t.logged_at && doneDay(t.completed_at) < today)
    || store.projects.some((p) => p.status === 'completed' && !p.logged_at && doneDay(p.completed_at) < today);
  useEffect(() => {
    if (!store.loading && mode === 'daily' && pending) logNow(today, true);
  }, [store.loading, mode, pending, today, logNow]);
}

/** Поля при отметке «выполнено»: в режиме «сразу» задача сразу уходит в Журнал. */
export function completeFields(mode: string): Partial<Task> & Partial<Project> {
  const at = nowISO();
  return { status: 'completed', completed_at: at, ...(mode === 'immediately' ? { logged_at: at } : {}) };
}
