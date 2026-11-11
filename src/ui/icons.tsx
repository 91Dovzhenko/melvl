// Иконки — с листа «Спецификация для Claude Code»: сетка 24, контур 1,8, скруглённые концы, без заливок.
import type { CSSProperties } from 'react';

export const ICONS = {
  inbox: 'M4 13h4.5l1.5 2.5h4l1.5-2.5H20 M4 13l2.2-7.2A2 2 0 0 1 8.1 4.4h7.8a2 2 0 0 1 1.9 1.4L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  today: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M12 2.5v2.2 M12 19.3v2.2 M2.5 12h2.2 M19.3 12h2.2 M5.3 5.3l1.6 1.6 M17.1 17.1l1.6 1.6 M5.3 18.7l1.6-1.6 M17.1 6.9l1.6-1.6',
  plans: 'M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z M4 10h16 M8 3v4 M16 3v4 M8 14h2 M14 14h2',
  log: 'M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z M9 12l2.2 2.2L15.5 10',
  showcase: 'M4 20h16 M5 15.5l4.5-4.5l3.5 3.5L19.5 8 M15 8h4.5v4.5',
  time: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 7.5V12l3 2',
  area: 'M12 3.5l8 4.2-8 4.2-8-4.2z M4 12.2l8 4.2 8-4.2 M4 16.4l8 4.2 8-4.2',
  evening: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z',
  tomorrow: 'M4 18h16 M7 18a5 5 0 0 1 10 0 M12 4v5 M9.5 6.5L12 9l2.5-2.5',
  someday: 'M4 5h16v4H4z M5.5 9v10h13V9 M10 13h4',
  clear: 'M7 7l10 10 M17 7L7 17',
  when: 'M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z M4 10h16 M8 3v4 M16 3v4',
  estimate: 'M12 9v4l2.5 1.5 M9 2.5h6 M12 2.5v3 M4.5 13a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0',
  skill: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  project: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 4v8h8',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5 M20 4v4.5h-4.5 M20 12a8 8 0 0 1-13.7 5.6L4 15.5 M4 20v-4.5h4.5',
  deadline: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 7.5v5 M12 16h.01',
  note: 'M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M14 3v5h5 M9 13h6 M9 17h4',
  quest: 'M6 21V4 M6 4h11l-2.5 4.5L17 13H6',
  move: 'M5 12h14 M13 6l6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  settings: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 5v4 M9 15v4',
  duplicate: 'M8 8h11v11H8z M5 16V5h11',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronDown: 'M6 9l6 6 6-6',
  logout: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10',
  google: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 12h8',
  // Иконки стартовых навыков; ключи — как в наборе 55 иконок (полный набор — этап 1)
  frame: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M9 9h6v6H9z',
  pencil: 'M4 20l4.2-1L19 8.2l-3.2-3.2L5 15.8z M13.8 7l3.2 3.2',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21',
  video: 'M4 7.5h11v9H4z M15 10.5l5-3v9l-5-3',
  scissors: 'M3.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M3.5 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M8 7.5L20 18 M8 16.5L20 6',
  megaphone: 'M4 10v4h3l7 4V6l-7 4z M17.5 9.5a3.5 3.5 0 0 1 0 5',
  sparkles: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
  gear: 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  chart: 'M4 20h16 M5 15.5l4.5-4.5l3.5 3.5L19.5 8 M15 8h4.5v4.5',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color = '#15171A', width = 1.8, style }: {
  name: IconName; size?: number; color?: string; width?: number; style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d={ICONS[name]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Кольцо прогресса проекта. Меню 16 (r5,5, линия 2,5), группа 18 (r7, 3), заголовок 28 (r11, 4). */
export function Ring({ progress, size = 16, done = false }: { progress: number; size?: 16 | 18 | 22 | 28; done?: boolean }) {
  const cfg = { 16: [5.5, 2.5], 18: [7, 3], 22: [6, 2.6], 28: [11, 4] }[size];
  const vb = size === 22 ? 18 : size;
  const [r, w] = cfg;
  const c = vb / 2;
  if (done) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="Проект завершён" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" fill="#3D6A00" />
        <path d="M4.8 8.2l2.1 2.1L11.3 6" fill="none" stroke="#FFFFFF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const len = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#E3E5DF" strokeWidth={w} />
      {p > 0 && (
        <circle cx={c} cy={c} r={r} fill="none" stroke="#3D6A00" strokeWidth={w}
          transform={`rotate(-90 ${c} ${c})`} strokeDasharray={`${(p * len).toFixed(2)} ${len.toFixed(2)}`} />
      )}
    </svg>
  );
}
