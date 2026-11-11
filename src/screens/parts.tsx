import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';
import { Pop, PopItem } from '../ui/Pop';

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

/** Меню «…» проекта/области: на Mac — белое меню у кнопки (не выходит за экран), на iPhone — нижний лист. */
export function MoreMenu({ label, items }: { label: string; items: { label: string; icon: IconName; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="tool" aria-label={label} title={label} aria-expanded={open}
        style={{ width: 34, height: 30, marginTop: 2, flexShrink: 0 }} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={18} color="#5F635C" width={3} />
      </button>
      {open && (
        <Pop anchor={btn.current} onClose={() => setOpen(false)} variant="light" width={220} title={label}>
          {items.map((it) => (
            <PopItem key={it.label} icon={it.icon} label={it.label} onClick={() => { setOpen(false); it.onClick(); }} />
          ))}
        </Pop>
      )}
    </>
  );
}
