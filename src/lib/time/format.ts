// Формат чисел учёта времени: «ч:мм», отклонения со знаком, пусто — «—».

const pad = (n: number) => String(n).padStart(2, '0');

/** Минуты → «ч:мм»; null — «—». */
export function fmtHM(min: number | null | undefined) {
  if (min === null || min === undefined) return '—';
  const a = Math.abs(Math.round(min));
  return `${min < 0 ? '−' : ''}${Math.floor(a / 60)}:${pad(a % 60)}`;
}

/** «+0:30» / «−1:30»; ноль — «0:00»; null — «—». */
export function fmtSigned(min: number | null | undefined) {
  if (min === null || min === undefined) return '—';
  if (Math.round(min) === 0) return '0:00';
  const a = Math.abs(Math.round(min));
  return `${min > 0 ? '+' : '−'}${Math.floor(a / 60)}:${pad(a % 60)}`;
}

/** Факт по дням: ноль — «—» (пустой день). */
export const fmtFact = (min: number | null | undefined) => (min ? fmtHM(min) : '—');

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const monthName = (month: string) => MONTHS_NOM[Number(month.slice(5, 7)) - 1];
