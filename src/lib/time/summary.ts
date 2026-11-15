// «Сводка»: таблица недели (пн–вс) по направлению или категории.

import { SLOT_MIN, type SummaryTable, type TimeDirection, type TimeSlot, type TimeWeekSchedule } from './types.ts';
import { dayAdd, daysInMonth, monthOf, weekDays, weekStartOf, weekdayMon0, type MskNow } from './clock.ts';
import { isWorkday, weekMask, type WeekMask } from './schedule.ts';
import { fmtHM, monthName } from './format.ts';

export type WeekState = 'past' | 'current' | 'future';

export type MonthNorm = { month: string; fact: number; norm: number; left: number; daysLeft: number };

export type Summary = {
  days: string[];
  weekState: WeekState;
  /** daily — норма «в рабочий день» (Факт / План / Отклонение); plain — остальное (Факт / Прошлая неделя / Разница). */
  mode: 'daily' | 'plain';
  fact: number[]; factTotal: number;
  /** daily */
  mask: WeekMask | null;
  plan: (number | null)[]; planTotal: number | null;
  dev: (number | null)[]; devTotal: number | null;
  /** plain */
  prev: number[]; prevTotal: number;
  diff: (number | null)[]; diffTotal: number | null;
  avg: number | null;
  /** «К прошлой*» */
  toPrev: number | null;
  month: MonthNorm | null;
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function matcher(table: SummaryTable) {
  return table.kind === 'direction'
    ? (s: TimeSlot) => s.direction_id === table.id
    : (s: TimeSlot) => s.category_id === table.id;
}

export function weekState(weekStart: string, today: string): WeekState {
  const cur = weekStartOf(today);
  return weekStart < cur ? 'past' : weekStart > cur ? 'future' : 'current';
}

export function weekSummary(p: {
  slots: TimeSlot[]; table: SummaryTable; weekStart: string; now: MskNow;
  direction?: TimeDirection | null; schedules: TimeWeekSchedule[];
}): Summary {
  const { now, weekStart } = p;
  const today = now.date;
  const days = weekDays(weekStart);
  const prevDays = weekDays(dayAdd(weekStart, -7));
  const state = weekState(weekStart, today);
  const match = matcher(p.table);
  const dayIdx = new Map<string, number>();
  days.forEach((d, i) => dayIdx.set(d, i));
  const prevIdx = new Map<string, number>();
  prevDays.forEach((d, i) => prevIdx.set(d, i));

  const fact = Array(7).fill(0) as number[];
  const prev = Array(7).fill(0) as number[];
  // «К прошлой» до текущего момента: тот же день недели и время.
  const todayI = weekdayMon0(today);
  const beforeNow = (i: number, slot: number) => i < todayI || (i === todayI && slot * SLOT_MIN <= now.min);
  let curToNow = 0, prevToNow = 0;
  for (const s of p.slots) {
    if (!match(s)) continue;
    const i = dayIdx.get(s.date);
    if (i !== undefined) {
      fact[i] += SLOT_MIN;
      if (state === 'current' && beforeNow(i, s.slot)) curToNow += SLOT_MIN;
      continue;
    }
    const j = prevIdx.get(s.date);
    if (j !== undefined) {
      prev[j] += SLOT_MIN;
      if (state === 'current' && beforeNow(j, s.slot)) prevToNow += SLOT_MIN;
    }
  }
  const factTotal = sum(fact);
  const prevTotal = sum(prev);
  const passed = days.map((d) => d <= today);
  // Клетка отклонения / разницы: прошедший день (включая сегодня) или день, где уже есть факт.
  const shown = (i: number) => passed[i] || fact[i] > 0;
  const toPrev = state === 'future' ? null : state === 'past' ? factTotal - prevTotal : curToNow - prevToNow;

  const dir = p.table.kind === 'direction' ? p.direction ?? null : null;
  const base = { days, weekState: state, fact, factTotal, prev, prevTotal, toPrev };

  if (dir && dir.norm_type === 'daily') {
    const mask = weekMask(p.schedules, dir.id, weekStart);
    const plan = days.map((_, i) => (isWorkday(mask.mask, i) ? dir.norm_min : null));
    const dev = days.map((_, i) => (shown(i) ? fact[i] - (plan[i] ?? 0) : null));
    const devCells = dev.filter((x): x is number => x !== null);
    const workPassed = days.map((_, i) => i).filter((i) => passed[i] && isWorkday(mask.mask, i));
    return {
      ...base, mode: 'daily', mask, plan,
      planTotal: plan.some((x) => x !== null) ? sum(plan.map((x) => x ?? 0)) : null,
      dev, devTotal: devCells.length ? sum(devCells) : null,
      diff: [], diffTotal: null,
      avg: workPassed.length ? sum(workPassed.map((i) => fact[i])) / workPassed.length : null,
      month: null,
    };
  }

  const diff = days.map((_, i) => (shown(i) ? fact[i] - prev[i] : null));
  const diffCells = diff.filter((x): x is number => x !== null);
  const passedN = passed.filter(Boolean).length;
  return {
    ...base, mode: 'plain', mask: null, plan: [], planTotal: null, dev: [], devTotal: null,
    diff, diffTotal: diffCells.length ? sum(diffCells) : null,
    avg: passedN ? sum(fact.filter((_, i) => passed[i])) / passedN : null,
    month: dir && dir.norm_type === 'monthly' ? monthNorm(p.slots, dir, weekStart, today) : null,
  };
}

/**
 * Месячная норма: факт — все слоты направления за календарный месяц недели.
 * Неделя на стыке месяцев: текущая — месяц сегодняшнего дня, иначе — месяц понедельника.
 */
export function monthNorm(slots: TimeSlot[], dir: TimeDirection, weekStart: string, today: string): MonthNorm {
  const month = weekState(weekStart, today) === 'current' ? monthOf(today) : monthOf(weekStart);
  let fact = 0;
  for (const s of slots) if (s.direction_id === dir.id && s.date.startsWith(month)) fact += SLOT_MIN;
  const curMonth = monthOf(today);
  const daysLeft = month === curMonth ? daysInMonth(month) - Number(today.slice(8, 10)) + 1
    : month < curMonth ? 0 : daysInMonth(month);
  return { month, fact, norm: dir.norm_min, left: Math.max(0, dir.norm_min - fact), daysLeft };
}

/** «Ноябрь: 42:30 из 100:00 · осталось 57:30 · дней в месяце осталось 14» */
export const monthLine = (m: MonthNorm) =>
  `${monthName(m.month)}: ${fmtHM(m.fact)} из ${fmtHM(m.norm)} · осталось ${fmtHM(m.left)} · дней в месяце осталось ${m.daysLeft}`;
