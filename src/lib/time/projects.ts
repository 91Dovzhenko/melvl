// «Проекты»: сравнение проектов задач направления по этапам.

import { SLOT_MIN, type TimeSlot, type TimeStage } from './types.ts';

export type ProjectLite = {
  id: string; name: string; status: string; deleted_at: string | null; created_at?: string | null;
};

export const MAX_PROJECT_COLUMNS = 4;

/** Проекты, на которые под направлением отмечено время (включая завершённые и удалённые), от новых к старым. */
export function directionProjects(slots: TimeSlot[], directionId: string, projects: ProjectLite[]): ProjectLite[] {
  const ids = new Set<string>();
  for (const s of slots) if (s.direction_id === directionId && s.project_id) ids.add(s.project_id);
  return projects.filter((p) => ids.has(p.id)).sort(byNewest);
}

const byNewest = (a: ProjectLite, b: ProjectLite) => {
  const x = a.created_at ?? '', y = b.created_at ?? '';
  return x < y ? 1 : x > y ? -1 : a.name.localeCompare(b.name, 'ru');
};

/** Столбцы: выбранные (не больше 4) в порядке от новых к старым; выбора нет — 4 самых новых. */
export function pickColumns(available: ProjectLite[], pick: string[] | null | undefined): ProjectLite[] {
  const chosen = pick?.length ? available.filter((p) => pick.includes(p.id)) : [];
  return (chosen.length ? chosen : available).slice(0, MAX_PROJECT_COLUMNS);
}

export type CompareRow = {
  key: string; label: string;
  kind: 'total' | 'stage' | 'nostage';
  /** Минуты по столбцам; 0 — «—». */
  values: number[];
  /** Индексы столбцов с максимумом (подсветка; только этапы и «Без этапа», при 2+ столбцах). */
  max: number[];
  /** Этап в архиве или удалён (показан, потому что есть часы). */
  archived?: boolean;
};

/**
 * Строки: «Всего», затем этапы направления по порядку (архивный / удалённый — только если есть часы в столбцах),
 * «Без этапа» — если есть слоты проекта без этапа.
 */
export function compareRows(slots: TimeSlot[], directionId: string, columns: ProjectLite[], stages: TimeStage[]): CompareRow[] {
  const col = new Map(columns.map((p, i) => [p.id, i]));
  const n = columns.length;
  const total = Array(n).fill(0) as number[];
  const none = Array(n).fill(0) as number[];
  const byStage = new Map<string, number[]>();
  for (const s of slots) {
    if (s.direction_id !== directionId || !s.project_id) continue;
    const i = col.get(s.project_id);
    if (i === undefined) continue;
    total[i] += SLOT_MIN;
    if (!s.stage_id) { none[i] += SLOT_MIN; continue; }
    const row = byStage.get(s.stage_id) ?? Array(n).fill(0);
    row[i] += SLOT_MIN;
    byStage.set(s.stage_id, row);
  }
  const rows: CompareRow[] = [{ key: 'total', label: 'Всего', kind: 'total', values: total, max: [] }];
  const own = stages.filter((s) => s.direction_id === directionId).sort((a, b) => a.sort_order - b.sort_order);
  for (const st of own) {
    const values = byStage.get(st.id) ?? Array(n).fill(0);
    const off = !!st.deleted_at || st.status !== 'active';
    if (off && !values.some((v) => v > 0)) continue;
    rows.push({ key: st.id, label: st.name, kind: 'stage', values, max: maxIdx(values), archived: off || undefined });
  }
  if (none.some((v) => v > 0)) rows.push({ key: 'nostage', label: 'Без этапа', kind: 'nostage', values: none, max: maxIdx(none) });
  return rows;
}

/** Максимум в строке: при равенстве — все; пустая строка и один столбец — без подсветки. */
export function maxIdx(values: number[]) {
  if (values.length < 2) return [];
  const m = Math.max(...values);
  if (m <= 0) return [];
  return values.flatMap((v, i) => (v === m ? [i] : []));
}

/** Выбор проектов: переключить галочку, не больше 4. */
export function togglePick(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  return current.length >= MAX_PROJECT_COLUMNS ? current : [...current, id];
}
