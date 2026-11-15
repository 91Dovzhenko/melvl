// Что делает бросок задачи в каждом списке (19_ТЗ, 2.1). Правила — в lib/reorder.ts (с тестами).
import { useStore, useToday } from '../lib/store';
import { placeAt, resolveSlot, todayDrop } from '../lib/reorder';
import { projectGroupMaps, projectGroupOf } from '../lib/views';
import type { Task } from '../lib/types';
import type { ListDrag } from './TaskList';

type Key = 'sort_order' | 'today_order';

export function useTaskDrops() {
  const store = useStore();
  const today = useToday();
  const byId = (id: string) => store.tasks.find((t) => t.id === id);

  /**
   * Поставить задачу на позицию index среди others по полю key; extra — что ещё меняется (вечер, дата).
   * Одна запись (или группа при совпадении соседей); ⌘Z отменяет. Плашка «Отменить» — только если меняется не только порядок.
   */
  const place = (id: string, others: string[], index: number, key: Key, extra: Partial<Task> = {}, message = 'Порядок изменён') => {
    const t = byId(id);
    if (!t) return;
    const ordered = others.map((o) => byId(o)).filter((x): x is Task => !!x).map((x) => ({ id: x.id, order: x[key] }));
    const changes = placeAt(ordered, index, id, t[key]);
    const real = Object.fromEntries(Object.entries(extra).filter(([k, v]) => (t as Record<string, unknown>)[k] !== v));
    const quiet = Object.keys(real).length === 0;
    store.withUndo(message, () => {
      for (const c of changes) store.patch('tasks', c.id, c.id === id ? { ...real, [key]: c.order } : { [key]: c.order });
    }, undefined, quiet);
  };

  const fromOf = (id: string) => (byId(id)?.when_evening ? 'evening' : 'day');
  const any: ListDrag['resolve'] = (_item, desired) => ({ index: desired, valid: true });

  return {
    /** Входящие: свободный порядок. */
    inbox(): ListDrag {
      return { id: 'inbox', resolve: any, drop: (item, index, others) => place(item.id, others, index, 'sort_order') };
    },

    /** Проект: порядок только внутри своей группы; дата и группа не меняются (над чужой — подсказка). */
    project(projectId: string): ListDrag {
      const { next, openCopy } = projectGroupMaps(store.tasks, store.rules);
      const group = (id: string) => { const t = byId(id); return t ? projectGroupOf(t, next, openCopy, today).key : ''; };
      return {
        id: 'project:' + projectId,
        resolve: (item, desired, others) => {
          const own = group(item.id);
          const groups = others.map(group);
          const origin = originIndex(groups, own);
          return resolveSlot(groups, own, desired, origin);
        },
        drop: (item, index, others) => place(item.id, others, index, 'sort_order'),
      };
    },

    /**
     * «Сегодня»: список группы group ('flat', 'evening', проект, область, 'none').
     * homeOf — своя дневная группа задачи (для вечерней — группа её проекта).
     */
    today(group: string, homeOf: (id: string) => string, placeOfGroup: (key: string) => { project_id: string | null; area_id: string | null } | null): ListDrag {
      return {
        id: 'today:' + group,
        resolve: (_item, desired) => ({ index: desired, valid: true }),
        drop: (item, index, others) => {
          const r = todayDrop(fromOf(item.id), group, homeOf(item.id));
          if (!r.ok) return;
          // В группу другого проекта / области / «без проекта» — задача переезжает туда (дата та же, навык — по правилам переноса).
          const to = r.moveTo ? placeOfGroup(r.moveTo) : null;
          if (r.moveTo && !to) return;
          const msg = to ? 'Задача перемещена' : r.evening ? 'Задача — на вечер' : 'Задача — в дневные';
          place(item.id, others, index, r.key, { when_evening: r.evening, ...(to ?? {}) }, msg);
        },
      };
    },

    /** «Планы»: внутри дня — порядок; на другой день — меняется дата. */
    plans(day: string): ListDrag {
      return {
        id: 'plans:' + day,
        resolve: any,
        drop: (item, index, others) => place(item.id, others, index, 'sort_order', { when_date: day }, 'Дата изменена'),
      };
    },
  };
}

/** Где задача стоит, если в своей группе она одна: после всех групп, которые идут раньше её группы. */
function originIndex(groups: string[], own: string): number {
  const rank = (k: string): [number, string] =>
    k === 'today' ? [1, ''] : k === 'evening' ? [1.5, ''] : k === 'none' ? [2, ''] : k.startsWith('date:') ? [3, k.slice(5)] : k === 'wait' ? [5, ''] : [6, ''];
  const o = rank(own);
  return groups.filter((g) => { const r = rank(g); return r[0] < o[0] || (r[0] === o[0] && r[1] < o[1]); }).length;
}
