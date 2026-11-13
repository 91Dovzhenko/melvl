// Подписи для экранов роста: ветки, часы, дни.
import { fmtMin } from '../dates';

const BRANCH_NAMES: Record<string, string> = { creator: 'Креатор', profession: 'Профессия' };
export const branchName = (key: string) => BRANCH_NAMES[key] ?? key;

/** Минуты → «ч:мм» (дробные — до минуты). */
export const fmtH = (min: number) => fmtMin(Math.round(min));

export function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

/** «18 дней», «1 день», «3 дня». */
export const daysText = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
