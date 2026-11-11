import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';

/** Шапка раздела с квадратным значком (Входящие, Сегодня, Планы, Журнал). */
export function BadgeHeader({ icon, title, lime, right }: { icon: IconName; title: string; lime?: boolean; right?: React.ReactNode }) {
  const phone = useIsPhone();
  return (
    <header className="screen-head">
      <div className="screen-title" style={phone ? { gap: 10 } : undefined}>
        <span className={'title-badge ' + (lime ? 'lime' : 'quiet')} style={phone ? { width: 34, height: 34, borderRadius: 11 } : undefined}>
          <Icon name={icon} size={phone ? 19 : 22} width={lime ? 2 : 1.9} />
        </span>
        <h1 className="title" style={phone ? { fontSize: 25 } : undefined}>{title}</h1>
      </div>
      {right}
    </header>
  );
}

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = el.scrollHeight + 'px';
}

/** Название по месту: клик — редактирование, Enter / уход фокуса — сохранить. */
export function EditableTitle({ value, placeholder, onSave, autoFocus, focusSignal }: {
  value: string; placeholder: string; onSave: (v: string) => void; autoFocus?: boolean; focusSignal?: number;
}) {
  const phone = useIsPhone();
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setV(value); }, [value]);
  useLayoutEffect(() => { autosize(ref.current); }, [v, phone]);
  useEffect(() => {
    if (!autoFocus && !focusSignal) return;
    // После клика по пункту меню фокус возвращается к кнопке — ставим его в следующем кадре.
    const id = window.setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 30);
    return () => window.clearTimeout(id);
  }, [autoFocus, focusSignal]);
  const save = () => { const t = v.trim(); if (t !== value) onSave(t); };
  return (
    <textarea ref={ref} className="title-edit" rows={1} value={v} placeholder={placeholder} aria-label="Название"
      style={phone ? { fontSize: 25 } : undefined}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ' '))}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); }
        if (e.key === 'Escape') { setV(value); setTimeout(() => ref.current?.blur()); }
      }} />
  );
}

/** Заметки по месту. */
export function EditableNotes({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setV(value); }, [value]);
  useLayoutEffect(() => { autosize(ref.current); }, [v]);
  return (
    <textarea ref={ref} className="notes-edit" rows={1} value={v} placeholder="Заметки" aria-label="Заметки"
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v); }} />
  );
}

/** Меню «…» — белое, радиус 14. */
export function MoreMenu({ label, items }: { label: string; items: { label: string; icon: IconName; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" className="tool" aria-label={label} title={label} aria-expanded={open}
        style={{ width: 34, height: 30, marginTop: 2 }} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={18} color="#5F635C" width={3} />
      </button>
      {open && (
        <div className="popover" role="menu" style={{ top: 36, left: 0 }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}>
              <Icon name={it.icon} size={15} color="#3E423C" />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
