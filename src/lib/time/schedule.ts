// Рабочие дни направлений с нормой «в рабочий день»: маска недели с автопереносом.

import type { TimeWeekSchedule } from './types.ts';

export type WeekMask = {
  /** 7 бит, пн = бит 0. */
  mask: number;
  /** own — у недели своя строка; inherited — взята с более ранней недели; none — графика ещё нет. */
  source: 'own' | 'inherited' | 'none';
  /** Неделя, с которой взята маска. */
  from: string | null;
};

/** Маска недели: своя строка, иначе — последней более ранней недели этого направления, иначе — все дни нерабочие. */
export function weekMask(schedules: TimeWeekSchedule[], directionId: string, weekStart: string): WeekMask {
  let best: TimeWeekSchedule | null = null;
  for (const s of schedules) {
    if (s.direction_id !== directionId || s.week_start > weekStart) continue;
    if (s.week_start === weekStart) return { mask: s.days, source: 'own', from: weekStart };
    if (!best || s.week_start > best.week_start) best = s;
  }
  return best ? { mask: best.days, source: 'inherited', from: best.week_start } : { mask: 0, source: 'none', from: null };
}

export const isWorkday = (mask: number, dayIdx: number) => ((mask >> dayIdx) & 1) === 1;

/** Клик по дате: копия маски недели (своей или унаследованной) с переключённым днём. */
export const toggleDay = (mask: number, dayIdx: number) => mask ^ (1 << dayIdx);

export const workdaysCount = (mask: number) => Array.from({ length: 7 }, (_, i) => isWorkday(mask, i)).filter(Boolean).length;
