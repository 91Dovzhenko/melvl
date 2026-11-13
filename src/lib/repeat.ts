import { addDays, iso, parseISO, shortDate } from './dates';

// Тот же расчёт, что в базе (supabase/migrations/0002_repeats.sql: repeat_next / repeat_first).
// В приложении он нужен для окна повтора («Ближайшие: …») и для просмотра без входа.

export type RepeatKind = 'after_completion' | 'daily' | 'weekly' | 'monthly';
export type RepeatUnit = 'day' | 'week' | 'month';

export type RepeatRule = {
  task_id: string;
  kind: RepeatKind;
  every: number;
  unit: RepeatUnit | null;
  weekdays: number[] | null; // 1 = пн … 7 = вс
  month_day: number | null;
  anchor_date: string | null;
  next_date: string | null;
  end_date: string | null;
  /** «Это привычка» — учитывается в привычках в сводке главы. */
  is_habit: boolean;
};

const isoDow = (d: string) => ((parseISO(d).getDay() + 6) % 7) + 1;
const mondayOf = (d: string) => addDays(d, 1 - isoDow(d));
const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
const monthIndex = (d: string) => parseISO(d).getFullYear() * 12 + parseISO(d).getMonth();
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export function repeatNext(kind: RepeatKind, every: number, weekdays: number[] | null, monthDay: number | null, anchor: string | null, after: string): string | null {
  const e = Math.max(every || 1, 1);
  const a = anchor ?? after;
  if (kind === 'daily') return addDays(after, e);
  if (kind === 'weekly') {
    if (!weekdays?.length) return null;
    let d = addDays(after, 1);
    for (let i = 0; i < 7 * e + 7; i++) {
      const weeks = daysBetween(mondayOf(a), mondayOf(d)) / 7;
      if (weekdays.includes(isoDow(d)) && ((weeks % e) + e) % e === 0) return d;
      d = addDays(d, 1);
    }
    return null;
  }
  if (kind === 'monthly') {
    if (!monthDay) return null;
    const k = Math.max(0, Math.trunc((monthIndex(after) - monthIndex(a)) / e) - 1);
    const am = parseISO(a);
    for (let i = 0; i < 4; i++) {
      const mi = am.getMonth() + (k + i) * e;
      const y = am.getFullYear() + Math.floor(mi / 12);
      const m = ((mi % 12) + 12) % 12;
      const cand = iso(new Date(y, m, Math.min(monthDay, lastDay(y, m))));
      if (cand > after) return cand;
    }
    return null;
  }
  return null;
}

export function repeatFirst(kind: RepeatKind, every: number, weekdays: number[] | null, monthDay: number | null, start: string) {
  if (kind === 'after_completion' || kind === 'daily') return start;
  return repeatNext(kind, every, weekdays, monthDay, start, addDays(start, -1));
}

/** Ближайшие даты по правилу, начиная с start (для подсказки в окне). */
export function upcoming(r: Pick<RepeatRule, 'kind' | 'every' | 'weekdays' | 'month_day' | 'end_date'>, start: string, n = 4) {
  if (r.kind === 'after_completion') return [];
  const out: string[] = [];
  let d = repeatFirst(r.kind, r.every, r.weekdays, r.month_day, start);
  while (d && out.length < n && (!r.end_date || d <= r.end_date)) {
    out.push(d);
    d = repeatNext(r.kind, r.every, r.weekdays, r.month_day, start, d);
  }
  return out;
}

const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const unitWord = (u: RepeatUnit | null, n: number) => {
  const f = (one: string, few: string, many: string) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  if (u === 'week') return f('неделю', 'недели', 'недель');
  if (u === 'month') return f('месяц', 'месяца', 'месяцев');
  return f('день', 'дня', 'дней');
};

/** Коротко о правиле: «Каждую неделю: ср, пт», «Через 1 неделю после выполнения». */
export function describe(r: Pick<RepeatRule, 'kind' | 'every' | 'unit' | 'weekdays' | 'month_day'>) {
  const e = r.every || 1;
  if (r.kind === 'after_completion') return `Через ${e} ${unitWord(r.unit ?? 'day', e)} после выполнения`;
  if (r.kind === 'daily') return e === 1 ? 'Каждый день' : `Раз в ${e} ${unitWord('day', e)}`;
  if (r.kind === 'weekly') {
    const days = (r.weekdays ?? []).slice().sort().map((d) => WD[d - 1]).join(', ');
    return (e === 1 ? 'Каждую неделю' : `Раз в ${e} ${unitWord('week', e)}`) + (days ? `: ${days}` : '');
  }
  return (e === 1 ? 'Каждый месяц' : `Раз в ${e} ${unitWord('month', e)}`) + (r.month_day ? `, ${r.month_day}-го` : '');
}

export const fmtShort = (d: string) => shortDate(d);
