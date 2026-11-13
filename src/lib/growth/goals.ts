// Расчёты «Целей» (15_ТЗ, п. 4.8): текущее значение, темп, прогноз, автоматическое взятие ступеней, «достигнута по правилу».

import type { Goal, GoalCalc, GoalMeasurement, GoalStep, PeriodUnit } from '../types.ts';
import { addDays, iso, parseISO } from '../dates.ts';

/** Дней в единице периода — для темпа и прогноза. */
const UNIT_DAYS: Record<PeriodUnit, number> = { week: 7, month: 365.25 / 12 };

const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);

/** Дата на n недель / месяцев раньше (месяцы — календарные, 31 мая − 3 мес = 28 февр.). */
export function shiftBack(date: string, n: number, unit: PeriodUnit): string {
  if (unit === 'week') return addDays(date, -7 * n);
  const d = parseISO(date);
  const y = d.getFullYear(), m = d.getMonth() - n;
  const last = new Date(y, m + 1, 0).getDate();
  return iso(new Date(y, m, Math.min(d.getDate(), last)));
}

/** Живые замеры по дате (старые → свежие). */
export function sortedMeasurements(ms: GoalMeasurement[]): GoalMeasurement[] {
  return ms.filter((m) => !m.deleted_at).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Живые ступени по порядку (снизу вверх; последняя — цель). */
export function sortedSteps(steps: GoalStep[]): GoalStep[] {
  return steps.filter((s) => !s.deleted_at).sort((a, b) => a.sort_order - b.sort_order);
}

/** Текущее значение — последний замер по дате. */
export function currentValue(ms: GoalMeasurement[]): number | null {
  const s = sortedMeasurements(ms);
  return s.length ? s[s.length - 1].value : null;
}

export const stepRule = (step: GoalStep, goal: Goal): GoalCalc => (step.calc === 'goal' ? goal.calc : step.calc);

/**
 * Среднее замеров за период цели, заканчивающийся на date: окно (date − период; date].
 * Считается, только если история покрывает период: есть замер не позже date − (период − 1 единица)
 * (при «3 месяца» и замерах раз в месяц — нужны три замера). Иначе null — ступень по среднему не берётся.
 */
export function averageAt(goal: Goal, ms: GoalMeasurement[], date: string): number | null {
  const s = sortedMeasurements(ms);
  const cover = shiftBack(date, goal.period_n - 1, goal.period_unit);
  if (!s.some((m) => m.date <= cover)) return null;
  const from = shiftBack(date, goal.period_n, goal.period_unit);
  const win = s.filter((m) => m.date > from && m.date <= date);
  return win.length ? win.reduce((sum, m) => sum + m.value, 0) / win.length : null;
}

/** Выполняет ли замер m правило ступени. */
export function stepSatisfied(goal: Goal, step: GoalStep, ms: GoalMeasurement[], m: { date: string; value: number }): boolean {
  if (stepRule(step, goal) === 'once') return m.value >= step.threshold;
  const avg = averageAt(goal, ms, m.date);
  return avg !== null && avg >= step.threshold;
}

export type StepsTaken = {
  /** Ступени, которые берёт замер (взять с датой замера). */
  steps: GoalStep[];
  /** Для плашки «Ступень взята»: последняя взятая и «+ ещё N». */
  last: GoalStep | null; more: number;
};

/**
 * Какие ступени берёт сохранённый замер. ms — все замеры цели вместе с сохранённым.
 * Проверяются только не взятые: взятая не снимается, даже если замер потом упал.
 * Ручное «не взята» живёт до следующего замера, который снова выполнит правило.
 * Та же функция даёт подсказку в форме замера («Ступень „2 000“ будет взята») — передать черновик замера.
 */
export function stepsTakenBy(goal: Goal, steps: GoalStep[], ms: GoalMeasurement[], saved: { date: string; value: number }): StepsTaken {
  const taken = sortedSteps(steps).filter((s) => !s.taken_at && stepSatisfied(goal, s, ms, saved));
  return { steps: taken, last: taken[taken.length - 1] ?? null, more: Math.max(0, taken.length - 1) };
}

/** Следующая ступень (первая не взятая) и сколько до неё. */
export function nextStep(steps: GoalStep[], ms: GoalMeasurement[]): { step: GoalStep; left: number } | null {
  const step = sortedSteps(steps).find((s) => !s.taken_at);
  if (!step) return null;
  return { step, left: step.threshold - (currentValue(ms) ?? 0) };
}

/**
 * Следующая ступень и «осталось» для экрана: по правилу ступени.
 * «Один раз» — от последнего замера. «Среднее» — от текущего среднего за период (иначе при замере выше порога вышло бы
 * «осталось 0», а ступень не взята); замеры ещё не покрывают период — left = null: «нужно больше замеров за период».
 */
export function nextStepLeft(goal: Goal, steps: GoalStep[], ms: GoalMeasurement[]):
  { step: GoalStep; byAverage: boolean; left: number | null; base: number | null } | null {
  const n = nextStep(steps, ms);
  if (!n) return null;
  if (stepRule(n.step, goal) === 'once') {
    const base = currentValue(ms) ?? 0;
    return { step: n.step, byAverage: false, left: n.step.threshold - base, base };
  }
  const s = sortedMeasurements(ms);
  const avg = s.length ? averageAt(goal, s, s[s.length - 1].date) : null;
  return { step: n.step, byAverage: true, left: avg === null ? null : n.step.threshold - avg, base: avg };
}

/** Подпись остатка: «осталось 7 250» или «нужно больше замеров за период». */
export const leftText = (n: { left: number | null }) =>
  n.left === null ? 'нужно больше замеров за период' : `осталось ${fmtNum(Math.max(0, n.left))}`;

export type Pace = {
  /** Прирост в единицах периода: «+410 в месяц». */
  perUnit: number; unit: PeriodUnit;
  /** Цель моложе периода — темп считается с первого замера. */
  fromFirst: boolean;
};

/**
 * Темп: (последний − последний замер на дату ≤ «последний − период»; нет такого — первый) / прошедшее время в единицах периода.
 * Меньше двух замеров (или все в один день) — null.
 */
export function pace(goal: Goal, ms: GoalMeasurement[]): Pace | null {
  const s = sortedMeasurements(ms);
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const edge = shiftBack(last.date, goal.period_n, goal.period_unit);
  const older = s.filter((m) => m.date <= edge);
  const ref = older.length ? older[older.length - 1] : s[0];
  const days = daysBetween(ref.date, last.date);
  if (days <= 0) return null;
  return { perUnit: (last.value - ref.value) / (days / UNIT_DAYS[goal.period_unit]), unit: goal.period_unit, fromFirst: !older.length };
}

export type Forecast =
  | { kind: 'allTaken' }
  /** Меньше двух замеров. */
  | { kind: 'needSecond' }
  /** Темп ≤ 0. */
  | { kind: 'unknown' }
  /** Следующая ступень по среднему: вместо даты — текущее среднее за период. */
  | { kind: 'average'; step: GoalStep; avg: number; periodN: number; unit: PeriodUnit }
  /** Ступень по среднему, а замеры ещё не покрывают период. */
  | { kind: 'needHistory'; step: GoalStep }
  | { kind: 'weeks'; step: GoalStep; weeks: number }
  | { kind: 'month'; step: GoalStep; year: number; month: number }
  | { kind: 'year'; step: GoalStep; year: number };

/**
 * Прогноз до следующей ступени: (порог − текущее) / темп от даты последнего замера. Только месяц.
 * Если следующая ступень считается по среднему — вместо даты текущее среднее за период на дату последнего замера.
 */
export function forecast(goal: Goal, steps: GoalStep[], ms: GoalMeasurement[], today: string): Forecast {
  const next = nextStep(steps, ms);
  if (!next) return { kind: 'allTaken' };
  const s = sortedMeasurements(ms);
  if (stepRule(next.step, goal) === 'average') {
    const avg = s.length ? averageAt(goal, s, s[s.length - 1].date) : null;
    if (avg === null) return { kind: 'needHistory', step: next.step };
    return { kind: 'average', step: next.step, avg, periodN: goal.period_n, unit: goal.period_unit };
  }
  if (s.length < 2) return { kind: 'needSecond' };
  const p = pace(goal, ms);
  if (!p || p.perUnit <= 0) return { kind: 'unknown' };
  const at = parseISO(s[s.length - 1].date);
  at.setTime(at.getTime() + (next.left / p.perUnit) * UNIT_DAYS[p.unit] * 86400000);
  const diff = (at.getTime() - parseISO(today).getTime()) / 86400000;
  if (diff < UNIT_DAYS.month) return { kind: 'weeks', step: next.step, weeks: Math.max(1, Math.ceil(diff / 7)) };
  if (diff > 2 * 365.25) return { kind: 'year', step: next.step, year: at.getFullYear() };
  return { kind: 'month', step: next.step, year: at.getFullYear(), month: at.getMonth() };
}

/** «Достигнута по правилу — отметить?»: цель активна и последняя ступень взята. Статус цели ставит человек. */
export function reachedByRule(goal: Goal, steps: GoalStep[]): boolean {
  const s = sortedSteps(steps);
  return goal.status === 'active' && s.length > 0 && !!s[s.length - 1].taken_at;
}

// ───────────── Формат ─────────────

const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};

/** Текст прогноза для экрана цели. */
export function forecastText(f: Forecast): string {
  switch (f.kind) {
    case 'allTaken': return 'все ступени взяты';
    case 'needSecond': return 'появится после второго замера';
    case 'unknown': return 'пока не определён';
    case 'average': return `среднее за ${f.periodN} ${f.unit === 'month' ? 'мес' : 'нед'} — ${fmtNum(f.avg)} из ${fmtNum(f.step.threshold)}`;
    case 'needHistory': return 'нужно больше замеров за период';
    case 'weeks': return `~ через ${f.weeks} ${plural(f.weeks, 'неделю', 'недели', 'недель')}`;
    case 'month': return `~ ${MONTHS_NOM[f.month]} ${f.year}`;
    case 'year': return `~ ${f.year}`;
  }
}

/** Число с пробелами по тысячам: «2 030», «1 234,5». Пробел — неразрывный. */
export function fmtNum(v: number): string {
  const neg = v < 0;
  const [int, frac] = String(Math.round(Math.abs(v) * 100) / 100).split('.');
  const s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? ',' + frac : '');
  return neg ? '−' + s : s;
}

/** Ввод числа: только цифры, пробелы и одна запятая/точка. Пусто или мусор — null. */
export function parseNum(s: string): number | null {
  const t = s.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
