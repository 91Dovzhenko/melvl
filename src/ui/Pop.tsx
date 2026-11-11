import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';
import { useIsPhone } from './useIsPhone';

export type Anchor = HTMLElement | { x: number; y: number };

/**
 * Всплывающее окно.
 * Mac — у кнопки (или у точки правого клика), позиция прижимается к видимой области: окно никогда не выходит за край.
 * iPhone — тёмный нижний лист (радиус 28 сверху, ручка 38×5, затемнение .38).
 * Внутри окна клики не закрывают раскрытую карточку (data-keep-card).
 */
export function Pop({ anchor, onClose, variant = 'dark', width = 280, align = 'auto', title, children }: {
  anchor: Anchor | null; onClose: () => void; variant?: 'dark' | 'light'; width?: number;
  /** auto: кнопка в левой половине экрана — окно вправо от её левого края, иначе — влево от правого. */
  align?: 'right' | 'left' | 'auto'; title?: string; children: React.ReactNode;
}) {
  const phone = useIsPhone();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Позиция: под якорем (или над ним, если снизу не помещается), по горизонтали — внутри экрана с полем 8.
  useLayoutEffect(() => {
    if (phone || !ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left: number; let top: number;
    if (anchor && 'getBoundingClientRect' in anchor) {
      const r = anchor.getBoundingClientRect();
      const side = align === 'auto' ? ((r.left + r.right) / 2 < vw / 2 ? 'left' : 'right') : align;
      left = side === 'right' ? r.right - w : r.left;
      top = r.bottom + 6;
      if (top + h > vh - 8 && r.top - 6 - h >= 8) top = r.top - 6 - h;
    } else {
      left = anchor?.x ?? 0;
      top = anchor?.y ?? 0;
      if (top + h > vh - 8) top = Math.max(8, top - h);
    }
    left = Math.min(Math.max(8, left), vw - w - 8);
    top = Math.min(Math.max(8, top), Math.max(8, vh - h - 8));
    setPos({ left, top });
  }, [anchor, phone, align]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor && 'contains' in anchor && anchor.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    if (!phone) {
      document.addEventListener('mousedown', onDown);
      window.addEventListener('resize', onClose);
    }
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose, phone]);

  if (phone) {
    return createPortal(
      <div className="sheet-scrim" data-keep-card onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <div className="sheet" ref={ref} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <span className="sheet-handle" aria-hidden="true" />
          {title && <div className="sheet-title">{title}</div>}
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div ref={ref} data-keep-card role="dialog" aria-label={title}
      // Окно живёт в портале: клики не должны «всплывать» в строку задачи, из которой оно открыто.
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}
      className={variant === 'dark' ? 'pop pop-dark' : 'pop pop-light'}
      style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

/** Пункт окна/меню. В тёмном окне и в нижнем листе — белый текст; выбранный — лайм. */
export function PopItem({ icon, iconColor, label, hint, selected, disabled, muted, onClick }: {
  icon?: IconName; iconColor?: string; label: React.ReactNode; hint?: string; selected?: boolean;
  disabled?: boolean; muted?: boolean; onClick?: () => void;
}) {
  return (
    <button type="button" className={'pop-item' + (selected ? ' selected' : '') + (muted ? ' muted' : '')}
      disabled={disabled} aria-pressed={selected || undefined} onClick={onClick}>
      {icon && <Icon name={icon} size={17} color={iconColor ?? 'currentColor'} width={1.9} />}
      <span className="pop-label">{label}</span>
      {hint && <span className="pop-hint">{hint}</span>}
      {selected && <Icon name="check" size={15} color="#C5F25A" width={2.4} />}
    </button>
  );
}

export function PopSep() { return <div className="pop-sep" />; }
export function PopGroup({ children }: { children: React.ReactNode }) { return <div className="pop-group">{children}</div>; }
