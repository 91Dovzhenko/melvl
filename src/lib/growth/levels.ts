// Кривые уровней (01_ТЗ, раздел 5; 15_ТЗ, п. 4.2).
// Поменять формулу = поменять строку в LEVEL_COST: уровни, «до уровня», главы и окно «i» пересчитаются сами.

export type LevelKind = 'skill' | 'branch' | 'total';

/** Сколько часов стоит переход с уровня n на n + 1. */
export const LEVEL_COST: Record<LevelKind, (n: number) => number> = {
  skill: (n) => 3 * Math.sqrt(n),
  branch: (n) => 6 + n,
  total: (n) => 12 + 1.5 * n,
};

// hours[kind][L] — часов накоплено к уровню L (уровень 1 = 0 ч). Индекс 0 не используется.
const hours: Record<LevelKind, number[]> = { skill: [0, 0], branch: [0, 0], total: [0, 0] };

/**
 * Сколько минут нужно накопить, чтобы получить уровень L.
 * Пороги — целые минуты (округление суммы часов), чтобы «до уровня», «Переход» и «Всего» в окне «i» сходились до минуты.
 */
export function minutesForLevel(kind: LevelKind, level: number): number {
  const h = hours[kind];
  while (h.length <= level) {
    const n = h.length - 1;
    h.push(h[n] + LEVEL_COST[kind](n));
  }
  return Math.round(h[Math.max(1, level)] * 60);
}

export type LevelInfo = {
  level: number;
  /** Накоплено минут. */
  minutes: number;
  /** Порог текущего уровня, мин. */
  floor: number;
  /** Порог следующего уровня, мин. */
  next: number;
  /** Сколько минут осталось до следующего уровня («до 6 — 12:30»). */
  toNext: number;
  /** Прогресс внутри уровня, 0…1. */
  progress: number;
};

export function levelInfo(kind: LevelKind, minutes: number): LevelInfo {
  const m = Math.max(0, minutes);
  let level = 1;
  while (minutesForLevel(kind, level + 1) <= m) level++;
  const floor = minutesForLevel(kind, level);
  const next = minutesForLevel(kind, level + 1);
  return { level, minutes: m, floor, next, toNext: next - m, progress: (m - floor) / (next - floor) };
}

export const levelOf = (kind: LevelKind, minutes: number) => levelInfo(kind, minutes).level;

/** Строки окна «Как растут уровни»: уровень · переход (мин) · всего (мин). */
export function levelTable(kind: LevelKind, levels: number[]) {
  return levels.map((level) => {
    const total = minutesForLevel(kind, level);
    return { level, step: total - minutesForLevel(kind, level - 1), total };
  });
}

/** Уровни окна «i»: 2–16 и 50. */
export const LEVEL_TABLE_ROWS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 50];
