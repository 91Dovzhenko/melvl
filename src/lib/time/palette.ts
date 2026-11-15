// Палитра категорий времени (спецификация, раздел 20): 10 приглушённых цветов. Не менять.

export const PALETTE = [
  { key: 'violet', name: 'Фиалка', hex: '#7C74B8' },
  { key: 'sky', name: 'Небо', hex: '#6FA8C7' },
  { key: 'apricot', name: 'Абрикос', hex: '#E0914A' },
  { key: 'sage', name: 'Шалфей', hex: '#8DB580' },
  { key: 'ochre', name: 'Охра', hex: '#D2B048' },
  { key: 'terracotta', name: 'Терракота', hex: '#CF7F68' },
  { key: 'blue', name: 'Синий', hex: '#4F7CC4' },
  { key: 'rose', name: 'Пыльная роза', hex: '#A3818C' },
  { key: 'teal', name: 'Бирюза', hex: '#5FA59A' },
  { key: 'graphite', name: 'Графит', hex: '#9A9C94' },
] as const;

export type PaletteKey = (typeof PALETTE)[number]['key'];
export const PALETTE_KEYS = PALETTE.map((p) => p.key) as string[];

export const colorHex = (key: string | null | undefined) => PALETTE.find((p) => p.key === key)?.hex ?? '#9A9C94';

/** Заливка блока: цвет с прозрачностью 0,16. */
export function tint(key: string | null | undefined, a = 0.16) {
  const n = parseInt(colorHex(key).slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
