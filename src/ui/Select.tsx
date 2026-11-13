// Общий выпадающий список (Спецификация, раздел 12; поведение — как Ant Design Select):
// поле с рамкой, текст слева, шеврон прижат к правому краю (≥ 12 px от текста), ширина от 140.
// Открытый список — тёмный, под полем на всю его ширину, выбранный пункт — #2E3130 с лаймовой галочкой.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export type SelectOption<T extends string> = { value: T; label: string; /** Путь иконки 24×24 (навык). */ icon?: string; hint?: string };

export function Select<T extends string>({ value, options, onChange, label, note, small, minWidth = 140, width, compact }: {
  value: T; options: SelectOption<T>[]; onChange: (v: T) => void; label: string;
  /** Подпись внизу открытого списка. */
  note?: string; small?: boolean; minWidth?: number;
  /** Фиксированная ширина поля (в строке текста); без неё поле тянется. */
  width?: number;
  /** Высота 30 — в строке окна повтора. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div className="sel" ref={ref} style={width ? { width, minWidth, flex: 'none' } : { minWidth }}>
      <button type="button" className={'sel-field' + (open ? ' open' : '') + (small ? ' small' : '') + (compact ? ' rep' : '')}
        aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {current?.icon && <Glyph d={current.icon} color="#3D6A00" />}
        <span className="sel-text">{current?.label ?? ''}</span>
        <Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
      </button>
      {open && (
        <div className="sel-list" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value}
              className={'sel-opt' + (o.value === value ? ' on' : '')} onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.icon && <Glyph d={o.icon} color="#C5F25A" />}
              <span>{o.label}</span>
              {o.hint && <span className="sel-hint">{o.hint}</span>}
              {o.value === value && <Icon name="check" size={14} color="#C5F25A" width={2.8} />}
            </button>
          ))}
          {note && <span className="sel-note">{note}</span>}
        </div>
      )}
    </div>
  );
}

function Glyph({ d, color }: { d: string; color: string }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
