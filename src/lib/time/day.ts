// «День»: блоки, «Учтено», «Последние», последний этап проекта, изменения слотов.

import { SLOTS, SLOT_MIN, type SlotValue, type TimeCategory, type TimeDirection, type TimeSlot, type TimeStage } from './types.ts';
import { slotTime } from './clock.ts';
import { fmtHM } from './format.ts';

/** Ключ значения: блок — подряд идущие слоты с одинаковым ключом. */
export const valueKey = (v: SlotValue) => `${v.category_id}|${v.direction_id ?? ''}|${v.project_id ?? ''}|${v.stage_id ?? ''}`;
export const sameValue = (a: SlotValue | null | undefined, b: SlotValue | null | undefined) =>
  !!a && !!b && valueKey(a) === valueKey(b);
export const pickValue = (v: SlotValue): SlotValue =>
  ({ category_id: v.category_id, direction_id: v.direction_id ?? null, project_id: v.project_id ?? null, stage_id: v.stage_id ?? null });

/** Слоты одного дня → массив из 48 (пустой слот — null). */
export function dayGrid(slots: TimeSlot[], date: string): (TimeSlot | null)[] {
  const g: (TimeSlot | null)[] = Array(SLOTS).fill(null);
  for (const s of slots) if (s.date === date && s.slot >= 0 && s.slot < SLOTS) g[s.slot] = s;
  return g;
}

export type Block = {
  /** Первый слот блока. */
  start: number;
  /** Слот после последнего (не включительно). */
  end: number;
  value: SlotValue;
};

/**
 * Блоки дня: подряд идущие слоты с одинаковым значением. Блок — только вид.
 * `split` — диапазон «разбитого на слоты» блока: внутри каждый слот — свой блок.
 */
export function dayBlocks(grid: (SlotValue | null)[], split?: { start: number; end: number } | null): Block[] {
  const out: Block[] = [];
  const inSplit = (i: number) => !!split && i >= split.start && i < split.end;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (!v) continue;
    const last = out[out.length - 1];
    if (last && last.end === i && sameValue(last.value, v) && !inSplit(i) && !inSplit(i - 1)) last.end = i + 1;
    else out.push({ start: i, end: i + 1, value: pickValue(v) });
  }
  return out;
}

/** Блок, в который входит слот. */
export const blockAt = (blocks: Block[], slot: number) => blocks.find((b) => slot >= b.start && slot < b.end) ?? null;

/** «Учтено»: заполненные слоты дня × 0:30, включая будущие. */
export const accountedMin = (grid: (SlotValue | null)[]) => grid.filter(Boolean).length * SLOT_MIN;

/** «1:00–8:00 · 7:00» — время блока и длительность. */
export function blockSpan(b: { start: number; end: number }) {
  return `${slotTime(b.start, false)}–${slotTime(b.end, false)} · ${fmtHM((b.end - b.start) * SLOT_MIN)}`;
}

export type Catalog = {
  categories: TimeCategory[]; directions: TimeDirection[]; stages: TimeStage[];
  projects: { id: string; name: string; status: string; deleted_at: string | null }[];
};

/** Путь значения: «Блог · Видео · Ролик про свет · Монтаж». */
export function valuePath(v: SlotValue, c: Catalog): string[] {
  const out: string[] = [];
  const cat = c.categories.find((x) => x.id === v.category_id);
  out.push(cat?.name ?? '—');
  if (v.direction_id) out.push(c.directions.find((x) => x.id === v.direction_id)?.name ?? '—');
  if (v.project_id) out.push(c.projects.find((x) => x.id === v.project_id)?.name ?? '—');
  if (v.stage_id) out.push(c.stages.find((x) => x.id === v.stage_id)?.name ?? '—');
  return out;
}

/** «Сон · 1:00–8:00 · 7:00». */
export const blockLabel = (b: Block, c: Catalog) => `${valuePath(b.value, c).join(' · ')} · ${blockSpan(b)}`;

/** Значение можно предложить в окне отметки: ничего в нём не в архиве и не удалено, проект открыт. */
export function isSelectable(v: SlotValue, c: Catalog) {
  const cat = c.categories.find((x) => x.id === v.category_id);
  if (!cat || cat.deleted_at || cat.status !== 'active') return false;
  if (v.direction_id) {
    const d = c.directions.find((x) => x.id === v.direction_id);
    if (!d || d.deleted_at || d.status !== 'active' || d.category_id !== v.category_id) return false;
  }
  if (v.project_id) {
    const p = c.projects.find((x) => x.id === v.project_id);
    if (!p || p.deleted_at || p.status !== 'open') return false;
  }
  if (v.stage_id) {
    const s = c.stages.find((x) => x.id === v.stage_id);
    if (!s || s.deleted_at || s.status !== 'active' || s.direction_id !== v.direction_id) return false;
  }
  return true;
}

/** «Последние»: последние различные значения целиком (по времени изменения слотов), без архивных и удалённых. */
export function recentValues(slots: TimeSlot[], c: Catalog, n = 4): SlotValue[] {
  const sorted = [...slots].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1
    : a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.slot - a.slot));
  const seen = new Set<string>();
  const out: SlotValue[] = [];
  for (const s of sorted) {
    const k = valueKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!isSelectable(s, c)) continue;
    out.push(pickValue(s));
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Последний этап, использованный в проекте (среди этапов направления):
 * этап самого позднего по времени слота с этим проектом и этапом.
 */
export function lastStageOf(slots: TimeSlot[], projectId: string, directionStages: string[]): string | null {
  const allowed = new Set(directionStages);
  let best: TimeSlot | null = null;
  for (const s of slots) {
    if (s.project_id !== projectId || !s.stage_id || !allowed.has(s.stage_id)) continue;
    if (!best || s.date > best.date || (s.date === best.date && s.slot > best.slot)) best = s;
  }
  return best?.stage_id ?? null;
}

/** Слоты диапазона от a до b включительно (в любом порядке). */
export function range(a: number, b: number) {
  const lo = Math.max(0, Math.min(a, b)), hi = Math.min(SLOTS - 1, Math.max(a, b));
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * Протянуть блок за край: от края блока до слота, где отпустили.
 * Возвращает слоты, которые получат значение блока (сам блок плюс пройденные).
 */
export function dragRange(block: { start: number; end: number }, edge: 'top' | 'bottom', to: number) {
  const t = Math.max(0, Math.min(SLOTS - 1, to));
  if (edge === 'bottom') return range(block.start, Math.max(t, block.start));
  return range(Math.min(t, block.end - 1), block.end - 1);
}

/** Новые границы блока: [start, end) — end не включительно. */
export type Span = { start: number; end: number };

/**
 * Протянуть блок за край в любую сторону (как событие в календаре): новые границы по слоту под курсором.
 * Нижняя ручка: конец — после слота под курсором; верхняя: начало — слот под курсором.
 * Минимум — 1 слот: дальше противоположного края ручка не идёт.
 */
export function dragSpan(block: Span, edge: 'top' | 'bottom', to: number): Span {
  const t = Math.max(0, Math.min(SLOTS - 1, to));
  if (edge === 'bottom') return { start: block.start, end: Math.max(block.start + 1, t + 1) };
  return { start: Math.min(t, block.end - 1), end: block.end };
}

/** Было [block), стало [next): какие слоты получат значение блока и какие слоты блока освободятся (станут пустыми). */
export function resizePlan(block: Span, next: Span) {
  const fill = range(next.start, next.end - 1);
  const clear: number[] = [];
  for (let i = block.start; i < block.end; i++) if (i < next.start || i >= next.end) clear.push(i);
  return { fill, clear };
}

/**
 * Изменения слотов при новых границах блока: значение — на новый диапазон, освободившиеся — очистить.
 * Одна правка — одна отмена: `prev` возвращает и перезаписанные, и очищенные слоты.
 */
export function planResize(grid: (SlotValue | null)[], block: Span, next: Span, value: SlotValue) {
  const { fill, clear } = resizePlan(block, next);
  const a = planSet(grid, fill, value);
  const b = planSet(grid, clear, null);
  return { changes: [...a.changes, ...b.changes], prev: [...a.prev, ...b.prev], filled: a.changes.length, cleared: b.changes.length };
}

/** Изменение слота: новое значение или null (очистить). */
export type SlotChange = { slot: number; value: SlotValue | null };

/**
 * Что поменять, чтобы поставить значение (или очистить) на слоты.
 * Слоты, где уже стоит то же самое, пропускаются. `prev` — прежние значения для отмены.
 */
export function planSet(grid: (SlotValue | null)[], slots: number[], value: SlotValue | null) {
  const changes: SlotChange[] = [];
  const prev: SlotChange[] = [];
  for (const i of [...new Set(slots)].sort((a, b) => a - b)) {
    const cur = grid[i] ?? null;
    if (value ? sameValue(cur, value) : !cur) continue;
    changes.push({ slot: i, value: value ? pickValue(value) : null });
    prev.push({ slot: i, value: cur ? pickValue(cur) : null });
  }
  return { changes, prev };
}

/** Длительность «до …» на iPhone: конец (слот после последнего) не дальше 24:00. */
export const untilEnd = (start: number, minutes: number) => Math.min(SLOTS, start + Math.max(1, Math.round(minutes / SLOT_MIN)));

/**
 * Значение можно записать: этап — только вместе с проектом и направлением, проект и направление — по желанию.
 * В базе проверка мягче (этап — только с направлением), правило «этап только с проектом» держит приложение.
 */
export const isWritableValue = (v: SlotValue) => !!v.category_id && (!v.stage_id || (!!v.project_id && !!v.direction_id));
