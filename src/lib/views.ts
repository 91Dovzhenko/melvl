import type { Area, Project, Task } from './types';
import type { Data } from './store';

const byOrder = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order;

/** Видна в списках: не удалена и не перенесена в Журнал; отменённые не показываем. */
export const isListed = (t: Task) => !t.logged_at && !t.deleted_at && t.status !== 'canceled';

export const isInbox = (t: Task) => !t.project_id && !t.area_id && !t.when_date && !t.someday;
export const isToday = (t: Task, today: string) => !t.someday && t.when_date !== null && t.when_date <= today;

/** Проекты в порядке меню: сначала без области, затем по областям. */
export function projectsInMenuOrder(d: Pick<Data, 'areas' | 'projects'>) {
  const listed = d.projects.filter((p) => !p.logged_at && p.status !== 'canceled');
  const loose = listed.filter((p) => !p.area_id).sort(byOrder);
  const areas = [...d.areas].sort(byOrder);
  return [...loose, ...areas.flatMap((a) => listed.filter((p) => p.area_id === a.id).sort(byOrder))];
}

export function sortedAreas(d: Pick<Data, 'areas'>) { return [...d.areas].sort(byOrder); }

export function inboxTasks(d: Pick<Data, 'tasks'>) {
  return d.tasks.filter((t) => isListed(t) && isInbox(t)).sort(byOrder);
}

export type Group = { key: string; kind: 'none' | 'project' | 'area' | 'evening'; project?: Project; area?: Area; tasks: Task[] };

/** «Сегодня»: без проекта (без заголовка) → проекты в порядке меню → задачи областей → «Вечером». */
export function todayGroups(d: Data, today: string, flat: boolean): Group[] {
  const all = d.tasks.filter((t) => isListed(t) && isToday(t, today))
    .sort((a, b) => a.today_order - b.today_order || a.sort_order - b.sort_order);
  const day = all.filter((t) => !t.when_evening);
  const evening = all.filter((t) => t.when_evening);
  const groups: Group[] = [];
  if (flat) {
    groups.push({ key: 'flat', kind: 'none', tasks: day });
  } else {
    groups.push({ key: 'none', kind: 'none', tasks: day.filter((t) => !t.project_id && !t.area_id) });
    for (const p of projectsInMenuOrder(d)) {
      groups.push({ key: p.id, kind: 'project', project: p, tasks: day.filter((t) => t.project_id === p.id) });
    }
    for (const a of sortedAreas(d)) {
      groups.push({ key: a.id, kind: 'area', area: a, tasks: day.filter((t) => !t.project_id && t.area_id === a.id) });
    }
    // Задачи проектов, которых нет в меню (например, перенесённых в Журнал), — без заголовка.
    const shown = new Set(groups.flatMap((g) => g.tasks.map((t) => t.id)));
    const rest = day.filter((t) => !shown.has(t.id));
    if (rest.length) groups[0].tasks.push(...rest);
  }
  groups.push({ key: 'evening', kind: 'evening', tasks: evening });
  return groups.filter((g) => g.tasks.length > 0);
}

export function projectTasks(d: Pick<Data, 'tasks'>, projectId: string) {
  return d.tasks.filter((t) => t.project_id === projectId && !t.deleted_at && t.status !== 'canceled').sort(byOrder);
}

/** Доля выполненных задач проекта от всех (без отменённых и удалённых). */
export function projectProgress(d: Pick<Data, 'tasks'>, projectId: string) {
  const own = d.tasks.filter((t) => t.project_id === projectId && !t.deleted_at && t.status !== 'canceled');
  if (!own.length) return 0;
  return own.filter((t) => t.status === 'completed').length / own.length;
}

export function counts(d: Pick<Data, 'tasks'>, today: string) {
  const open = d.tasks.filter((t) => isListed(t) && t.status === 'open');
  return {
    inbox: open.filter(isInbox).length,
    today: open.filter((t) => isToday(t, today)).length,
  };
}

export function projectName(d: Pick<Data, 'projects'>, id: string | null) {
  return id ? d.projects.find((p) => p.id === id)?.name ?? '' : '';
}

/** Порядок для вставки после задачи `after` в списке `list` (или в конец) по полю `key`. */
export function orderAfter(list: Task[], after: Task | undefined, key: 'sort_order' | 'today_order' = 'sort_order') {
  const sorted = [...list].sort((a, b) => a[key] - b[key]);
  if (!after) return (sorted.at(-1)?.[key] ?? 0) + 1;
  const i = sorted.findIndex((x) => x.id === after.id);
  const next = sorted[i + 1];
  return next ? (after[key] + next[key]) / 2 : after[key] + 1;
}

/** Навык задачи: свой или «из проекта» (если у задачи не задан, а у проекта есть навык по умолчанию). */
export function skillOf(d: Pick<Data, 'skills' | 'projects'>, t: Pick<Task, 'skill_id' | 'project_id'>) {
  if (t.skill_id) return { skill: d.skills.find((s) => s.id === t.skill_id), inherited: false };
  const p = t.project_id ? d.projects.find((x) => x.id === t.project_id) : undefined;
  const skill = p?.default_skill_id ? d.skills.find((s) => s.id === p.default_skill_id) : undefined;
  return { skill, inherited: !!skill };
}

const est = (t: Task) => t.estimate_min ?? 0;

/**
 * Блок «Сегодня» (спецификация, «Суммы часов»): осталось — оценки невыполненных задач дня (с «Вечером»);
 * запланировано — все задачи дня, включая выполненные; задачи N из M; полоса — доля выполненных часов.
 */
export function todaySums(list: Task[]) {
  const planned = list.reduce((m, t) => m + est(t), 0);
  const left = list.filter((t) => t.status === 'open').reduce((m, t) => m + est(t), 0);
  const done = list.filter((t) => t.status === 'completed').length;
  return { left, planned, done, total: list.length, pct: planned ? (planned - left) / planned : 0 };
}

/**
 * Проект и область: сегодня (включая просроченные), завтра, позже (после завтра и без даты), всего.
 * Выполненные, «Когда-нибудь» и задачи без оценки не считаются.
 */
export function planSums(tasks: Task[], today: string, tomorrow: string) {
  const open = tasks.filter((t) => isListed(t) && t.status === 'open' && !t.someday);
  const sum = (f: (t: Task) => boolean) => open.filter(f).reduce((m, t) => m + est(t), 0);
  const tToday = sum((t) => t.when_date !== null && t.when_date <= today);
  const tTomorrow = sum((t) => t.when_date === tomorrow);
  const tLater = sum((t) => t.when_date === null || t.when_date > tomorrow);
  return { today: tToday, tomorrow: tTomorrow, later: tLater, total: tToday + tTomorrow + tLater,
    noEstimate: open.filter((t) => t.estimate_min === null).length };
}
