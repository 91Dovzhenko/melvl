// Время по Москве и даты дней без зависимости от часового пояса устройства.
// Москва — UTC+3 круглый год (без перехода на летнее время с 2014 г.).

import { SLOT_MIN } from './types.ts';

const MSK_OFFSET_MIN = 180;
const pad = (n: number) => String(n).padStart(2, '0');

/** Момент по Москве: день и минута от начала дня. */
export type MskNow = { date: string; min: number };

export function mskNow(d: Date = new Date()): MskNow {
  const t = new Date(d.getTime() + MSK_OFFSET_MIN * 60_000);
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    min: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/** Текущий слот (0–47) для момента по Москве. */
export const slotOfMin = (min: number) => Math.min(47, Math.floor(min / SLOT_MIN));

// ── Даты дней YYYY-MM-DD: арифметика в UTC, чтобы не зависеть от пояса устройства ──

const toUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (t: number) => { const x = new Date(t); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };

export const dayAdd = (s: string, n: number) => fromUTC(toUTC(s) + n * 86_400_000);
export const dayDiff = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86_400_000);
/** День недели: 0 = пн … 6 = вс. */
export const weekdayMon0 = (s: string) => (new Date(toUTC(s)).getUTCDay() + 6) % 7;
/** Понедельник недели дня. */
export const weekStartOf = (s: string) => dayAdd(s, -weekdayMon0(s));
/** Дни недели пн…вс. */
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => dayAdd(monday, i));
/** «2026-11» */
export const monthOf = (s: string) => s.slice(0, 7);
export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const lastDayOfMonth = (month: string) => `${month}-${pad(daysInMonth(month))}`;

/** Слот → «11:00» (48 → «24:00»). */
export function slotTime(slot: number, leadingZero = true) {
  const m = slot * SLOT_MIN;
  const h = Math.floor(m / 60);
  return `${leadingZero ? pad(h) : h}:${pad(m % 60)}`;
}

/** Подпись слота в «Дне» — диапазон «08:00 – 08:30»; последний — «23:30 – 24:00» (ТЗ 24, п. 1). */
export const slotRange = (slot: number) => `${slotTime(slot)} – ${slotTime(slot + 1)}`;

/**
 * Смена дня: открыт сегодняшний день и по Москве наступил новый — показываем новый день.
 * Открыт другой день — остаётся.
 */
export const dayAfterTick = (openDate: string, prevToday: string, nowToday: string) =>
  openDate === prevToday && nowToday !== prevToday ? nowToday : openDate;
