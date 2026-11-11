// «Сегодня» — локальная дата устройства. Даты задач хранятся как YYYY-MM-DD.

const pad = (n: number) => String(n).padStart(2, '0');

export function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() { return iso(new Date()); }

export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/** «24 нояб.» */
export function shortDate(s: string) {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Метка срока в проекте: «Чт» — в ближайшие 6 дней, дальше — «24 нояб.». */
export function dueChip(s: string, today = todayISO()) {
  const diff = Math.round((parseISO(s).getTime() - parseISO(today).getTime()) / 86400000);
  if (diff >= 1 && diff <= 6) return WD[parseISO(s).getDay()];
  return shortDate(s);
}

/** Минуты → «ч:мм» (0:15, 1:30, 12:45). */
export function fmtMin(m: number) {
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}
