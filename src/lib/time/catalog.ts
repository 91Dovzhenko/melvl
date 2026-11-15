// Справочники учёта: «с часами» (удаление = в архив), перенос направления в другую категорию.

import type { TimeSlot } from './types.ts';

export type CatalogKind = 'category' | 'direction' | 'stage';

const field = { category: 'category_id', direction: 'direction_id', stage: 'stage_id' } as const;

/** Минуты, отмеченные на категорию / направление / этап. */
export function usageMin(slots: TimeSlot[], kind: CatalogKind, id: string) {
  const f = field[kind];
  let n = 0;
  for (const s of slots) if (s[f] === id) n += 30;
  return n;
}

/** «Удалить»: с часами — в архив (остаётся в отчётах и слотах), без часов — мягкое удаление. */
export const deleteMode = (slots: TimeSlot[], kind: CatalogKind, id: string): 'archive' | 'delete' =>
  (usageMin(slots, kind, id) > 0 ? 'archive' : 'delete');

/** Перенос направления: слоты, у которых меняется category_id (вместе с направлением, одной транзакцией в базе). */
export const slotsToMove = (slots: TimeSlot[], directionId: string, toCategory: string) =>
  slots.filter((s) => s.direction_id === directionId && s.category_id !== toCategory);
