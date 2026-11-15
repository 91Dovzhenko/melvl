// «День» на Mac (21_ТЗ, 5.1; спецификация «Время», разделы 3–5, 7).
// 48 слотов по 30 мин; одинаковые соседи — один блок (блок — только вид, данные — слоты).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../../ui/useIsPhone';
import { useStore } from '../../lib/store';
import { Icon } from '../../ui/icons';
import { DatePicker } from '../../ui/DatePicker';
import type { Anchor } from '../../ui/Pop';
import { dayAdd, dayAfterTick, slotOfMin, slotTime, weekdayMon0 } from '../../lib/time/clock';
import { fmtHM } from '../../lib/time/format';
import { colorHex, tint } from '../../lib/time/palette';
import {
  accountedMin, blockAt, dayBlocks, dayGrid, dragRange, planSet, range, sameValue, untilEnd, valuePath, type Block,
} from '../../lib/time/day';
import { SLOTS, SLOT_MIN, type SlotValue } from '../../lib/time/types';
import { MarkPop } from './MarkPop';
import { useCatalog, useMskNow } from './useTime';

const ROW = 28;
const PREVIEW = '\u0000p';
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Сегодня, 16 ноября» / «Вс, 15 ноября» (другой год — с годом). */
export function dayTitle(date: string, today: string, short = false) {
  const [y, m, d] = date.split('-').map(Number);
  const tail = `${d} ${(short ? MONTHS_SHORT : MONTHS_GEN)[m - 1]}${y !== Number(today.slice(0, 4)) ? ` ${y}` : ''}`;
  if (date === today) return `Сегодня, ${tail}`;
  if (date === dayAdd(today, -1)) return `Вчера, ${tail}`;
  if (date === dayAdd(today, 1)) return `Завтра, ${tail}`;
  return `${WD[weekdayMon0(date)]}, ${tail}`;
}

const nowText = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const nSlots = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'слот' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'слота' : 'слотов'}`;
const runs = (sel: number[]) => {
  const out: { start: number; end: number }[] = [];
  for (const i of sel) {
    const last = out[out.length - 1];
    if (last && last.end === i) last.end = i + 1; else out.push({ start: i, end: i + 1 });
  }
  return out;
};

type Drag =
  | { kind: 'select'; from: number; at: number; moved: boolean }
  | { kind: 'fill'; edge: 'top' | 'bottom'; block: { start: number; end: number }; value: SlotValue; to: number };

export function DayView() {
  const store = useStore();
  const catalog = useCatalog();
  const phone = useIsPhone();
  /** Строка слота: Mac 28, iPhone 36. */
  const rowH = phone ? 36 : ROW;
  const [wheel, setWheel] = useState(false);
  const now = useMskNow();
  const [date, setDate] = useState(now.date);
  const [sel, setSel] = useState<number[]>([]);
  const [anchorSlot, setAnchorSlot] = useState<number | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [blockSel, setBlockSel] = useState(false);
  const [split, setSplit] = useState<{ start: number; end: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverSel, setHoverSel] = useState(false);
  const [cal, setCal] = useState<Anchor | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const reset = () => { setSel([]); setPopOpen(false); setBlockSel(false); setSplit(null); setDrag(null); };

  // Смена дня: открыт сегодняшний и по Москве наступил новый — переходим; выделение и окно закрываются.
  const prevToday = useRef(now.date);
  useEffect(() => {
    if (now.date === prevToday.current) return;
    const was = prevToday.current;
    prevToday.current = now.date;
    setDate((d) => {
      const next = dayAfterTick(d, was, now.date);
      if (next !== d) reset();
      return next;
    });
  }, [now.date]);

  const grid = useMemo(() => dayGrid(store.time_slots, date), [store.time_slots, date]);
  const isToday = date === now.date;
  const accounted = accountedMin(grid);
  const empty = accounted === 0;

  // Во время протягивания: пройденные слоты — значение блока, бледно и в пунктире.
  const preview = useMemo(() => {
    if (drag?.kind !== 'fill') return null;
    const all = dragRange(drag.block, drag.edge, drag.to);
    const extra = all.filter((i) => i < drag.block.start || i >= drag.block.end);
    return extra.length ? { slots: extra, value: drag.value, start: extra[0], end: extra[extra.length - 1] + 1 } : null;
  }, [drag]);
  const shown = useMemo(() => {
    if (!preview) return grid as (SlotValue | null)[];
    const g = [...grid] as (SlotValue | null)[];
    for (const i of preview.slots) g[i] = { ...preview.value, category_id: preview.value.category_id + PREVIEW };
    return g;
  }, [grid, preview]);
  const blocks = useMemo(() => dayBlocks(shown, split), [shown, split]);

  /** Выделение — один целый блок одного значения: у него ручки протягивания. */
  const selRuns = runs(sel);
  const selBlock = useMemo(() => {
    if (selRuns.length !== 1) return null;
    const { start, end } = selRuns[0];
    const v = grid[start];
    if (!v) return null;
    for (let i = start; i < end; i++) if (!sameValue(grid[i], v)) return null;
    return { start, end, value: v as SlotValue };
  }, [sel, grid]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotAt = (clientY: number) => {
    const r = listRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(SLOTS - 1, Math.floor((clientY - r.top) / rowH)));
  };

  // Прокрутка при открытии: сегодня — линия «сейчас» на трети высоты, иначе — к 07:00.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const y = isToday ? top + now.min / SLOT_MIN * rowH - window.innerHeight / 3 : top + 14 * rowH - 120;
    window.scrollTo({ top: Math.max(0, y) });
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Мышь: протянуть по слотам / протянуть блок за край; у края окна — автопрокрутка.
  // Обработчики вешаются сразу при нажатии (не эффектом) — короткое протягивание не теряет отпускание.
  const live = useRef({ grid, split, applyFill: (_d: Extract<Drag, { kind: 'fill' }>) => {} });
  const beginDrag = (start: Drag) => {
    dragRef.current = start;
    setDrag(start);
    let lastY = 0;
    const update = (y: number) => {
      const d = dragRef.current;
      if (!d) return;
      const i = slotAt(y);
      if (d.kind === 'select') {
        if (i !== d.at) {
          const next = { ...d, at: i, moved: true };
          dragRef.current = next; setDrag(next);
          setSel(range(d.from, i));
        }
      } else if (i !== d.to) {
        const next = { ...d, to: i };
        dragRef.current = next; setDrag(next);
      }
    };
    const move = (e: MouseEvent) => { lastY = e.clientY; update(e.clientY); };
    const timer = window.setInterval(() => {
      if (!lastY) return;
      const edge = 48;
      const dy = lastY < edge ? -14 : lastY > window.innerHeight - edge ? 14 : 0;
      if (dy) { window.scrollBy(0, dy); update(lastY); }
    }, 30);
    const up = (e: MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      window.clearInterval(timer);
      if (e.clientY) update(e.clientY);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const { grid: g, split: sp } = live.current;
      if (d.kind === 'select') {
        // Клик (без протягивания) по заполненному слоту вне разбитого блока — выделяется весь блок.
        const v = g[d.from];
        const inSplit = sp && d.from >= sp.start && d.from < sp.end;
        if (!d.moved && v && !inSplit) {
          const b = blockAt(dayBlocks(g, sp), d.from)!;
          setSel(range(b.start, b.end - 1));
          setBlockSel(true);
        } else setBlockSel(false);
        setPopOpen(true);
      } else live.current.applyFill(d);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const label = (v: SlotValue) => valuePath(v, catalog).join(' · ');
  const span = (start: number, end: number) => `${slotTime(start, false)}–${slotTime(end, false)}`;

  const applyFill = (d: Extract<Drag, { kind: 'fill' }>) => {
    const slots = dragRange(d.block, d.edge, d.to);
    const { changes } = planSet(grid, slots, d.value);
    const lo = slots[0], hi = slots[slots.length - 1] + 1;
    setSel(range(lo, hi - 1));
    setBlockSel(true);
    setPopOpen(false);
    if (!changes.length) return;
    const where = d.edge === 'bottom' ? `до ${slotTime(hi, false)}` : `с ${slotTime(lo, false)}`;
    store.withUndo(`${label(d.value)} — ${where}, ${nSlots(changes.length)}`, () => store.setSlots(date, changes));
  };

  live.current = { grid, split, applyFill };

  const applyValue = (v: SlotValue | null) => {
    const { changes } = planSet(grid, sel, v);
    const r = runs(sel);
    const where = r.length === 1 ? span(r[0].start, r[0].end) : nSlots(sel.length);
    setPopOpen(false);
    setSel([]);
    setBlockSel(false);
    if (!changes.length) return;
    store.withUndo(v ? `${label(v)} · ${where}` : `Очищено · ${where}`, () => store.setSlots(date, changes));
  };

  // Клик вне списка и окна — снять выделение и собрать разбитый блок.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || popRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.('.pop, .modal-scrim, .toast')) return;
      setPopOpen(false); setSel([]); setBlockSel(false); setSplit(null);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  // Клавиатура дня (окно отметки перехватывает свои клавиши раньше).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (popOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'Escape') { if (sel.length || split) { e.preventDefault(); setSel([]); setSplit(null); setBlockSel(false); } return; }
      if (!sel.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const i = isToday ? slotOfMin(now.min) : 16;
        setSel([i]); setAnchorSlot(i); setBlockSel(false);
        return;
      }
      if (!sel.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const a = anchorSlot ?? sel[0];
        if (e.shiftKey) {
          const head = (sel[0] === a ? sel[sel.length - 1] : sel[0]) + dir;
          setSel(range(a, Math.max(0, Math.min(SLOTS - 1, head))));
        } else {
          const i = Math.max(0, Math.min(SLOTS - 1, (dir > 0 ? sel[sel.length - 1] : sel[0]) + dir));
          setSel([i]); setAnchorSlot(i);
        }
        setBlockSel(false);
      } else if (e.key === 'Enter') { e.preventDefault(); setPopOpen(true); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); applyValue(null); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  /** iPhone: тап по слоту — лист; по блоку — лист блока; в разбитом блоке — лист слота; вне разбитого — собрать. */
  const onPhoneTap = (e: React.MouseEvent) => {
    const i = slotAt(e.clientY);
    if (split && (i < split.start || i >= split.end)) { setSplit(null); setSel([]); return; }
    const inSplit = split && i >= split.start && i < split.end;
    setWheel(false);
    if (grid[i] && !inSplit) {
      const b = blockAt(dayBlocks(grid, split), i)!;
      setSel(range(b.start, b.end - 1)); setBlockSel(true);
    } else { setSel([i]); setBlockSel(false); }
    setPopOpen(true);
  };

  const onListDown = (e: React.MouseEvent) => {
    if (phone || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    e.preventDefault();
    const i = slotAt(e.clientY);
    if (split && (i < split.start || i >= split.end)) setSplit(null);
    if (e.shiftKey && anchorSlot !== null) {
      setSel(range(anchorSlot, i)); setBlockSel(false); setPopOpen(true);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)));
      setAnchorSlot(i); setBlockSel(false); setPopOpen(true);
      return;
    }
    setPopOpen(false);
    setAnchorSlot(i);
    setSel([i]);
    beginDrag({ kind: 'select', from: i, at: i, moved: false });
  };

  const startFill = (edge: 'top' | 'bottom') => (e: React.MouseEvent) => {
    if (!selBlock || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setPopOpen(false);
    beginDrag({ kind: 'fill', edge, block: { start: selBlock.start, end: selBlock.end }, value: selBlock.value, to: edge === 'bottom' ? selBlock.end - 1 : selBlock.start });
  };

  // Окно отметки — у правого края списка на уровне выделения; не выходит за низ дня.
  const [popTop, setPopTop] = useState(0);
  useLayoutEffect(() => {
    if (!popOpen || !sel.length) return;
    const h = popRef.current?.offsetHeight ?? 0;
    setPopTop(Math.max(0, Math.min(sel[0] * rowH - 30, SLOTS * rowH - h)));
  }, [popOpen, sel]);
  useEffect(() => {
    if (popOpen) popRef.current?.scrollIntoView({ block: 'nearest' });
  }, [popOpen, popTop]);

  const selHead = (() => {
    const r = runs(sel);
    if (!r.length) return '';
    const base = r.length === 1 ? `${span(r[0].start, r[0].end)} · ` : '';
    if (blockSel && selBlock) return `${base}весь блок, ${nSlots(sel.length)}`;
    if (split && r.length === 1 && r[0].start >= split.start && r[0].end <= split.end) return `${base}${nSlots(sel.length)} из блока`;
    return `${base}${nSlots(sel.length)}`;
  })();
  const current = blockSel && selBlock ? selBlock.value : (split && selBlock ? selBlock.value : null);

  const nowSlot = isToday ? slotOfMin(now.min) : -1;
  const pct = Math.round(accounted / (24 * 60) * 100);

  // iPhone: «13:30 → до 14:00 ›», длительности 30 мин … 4 ч, колесо окончания с шагом 30 мин.
  const selStart = sel[0] ?? 0;
  const selEnd = sel.length ? sel[sel.length - 1] + 1 : 0;
  const setEnd = (end: number) => setSel(range(selStart, Math.max(selStart, Math.min(SLOTS, end) - 1)));
  const wholeBlock = blockSel && selBlock && selBlock.start === selStart && selBlock.end === selEnd;
  const untilInfo = `${wholeBlock ? 'весь блок' : nSlots(sel.length)} · ${fmtHM(sel.length * SLOT_MIN)}`;
  const sheetHead = `${span(selStart, selEnd)}${wholeBlock ? ' · весь блок' : ''}`;
  const untilTop = phone && sel.length > 0 && runs(sel).length === 1 ? (
    <div className="mp-until">
      <div className="mp-until-line">
        <span className="from">{slotTime(selStart)}</span>
        <Icon name="move" size={14} color="#B4B8B0" width={2.2} />
        <span>до</span>
        <button type="button" className={'mp-until-end' + (wheel ? ' on' : '')} onClick={() => setWheel((w) => !w)}>{slotTime(selEnd)} ›</button>
        <span className="info">{untilInfo}</span>
      </div>
      <div className="mp-durs">
        {[30, 60, 120, 180, 240].map((m) => {
          const on = selEnd - selStart === m / SLOT_MIN;
          const fits = selStart + m / SLOT_MIN <= SLOTS;
          return (
            <button key={m} type="button" className={on ? 'on' : ''} disabled={!fits} aria-pressed={on}
              onClick={() => setEnd(untilEnd(selStart, m))}>{m < 60 ? '30 мин' : `${m / 60} ч`}</button>
          );
        })}
      </div>
    </div>
  ) : null;
  const wheelNode = phone && wheel ? <EndWheel start={selStart} end={selEnd} onPick={(e2) => { setEnd(e2); setWheel(false); }} /> : null;

  const sheetEl = phone && popOpen && sel.length > 0 ? createPortal(
    <div className="sheet-scrim" data-keep-card onClick={() => { setPopOpen(false); setSel([]); setWheel(false); }}>
      <MarkPop ref={popRef} sheet head={wheel ? 'До какого времени' : sheetHead} current={current} block={!!wholeBlock} catalog={catalog}
        style={{}} top={untilTop} wheel={wheelNode}
        onPick={(v) => { setWheel(false); applyValue(v); }} onClear={() => { setWheel(false); applyValue(null); }}
        onClose={() => { setPopOpen(false); setSel([]); setWheel(false); }}
        onSplit={wholeBlock && selBlock.end - selBlock.start > 1 ? () => {
          setSplit({ start: selBlock.start, end: selBlock.end }); setSel([]); setBlockSel(false); setPopOpen(false);
        } : undefined} />
    </div>,
    document.body,
  ) : null;

  if (phone) {
    return (
      <>
        <div className="day-bar ph">
          <span className="day-title">{dayTitle(date, now.date, true)}</span>
          <button type="button" className="day-nav" aria-label="Предыдущий день" onClick={() => { reset(); setDate((d) => dayAdd(d, -1)); }}><Icon name="back" size={14} width={2.4} /></button>
          <button type="button" className="day-nav" aria-label="Следующий день" onClick={() => { reset(); setDate((d) => dayAdd(d, 1)); }}><Icon name="chevronRight" size={14} width={2.4} /></button>
          {!isToday && <button type="button" className="day-today away" onClick={() => { reset(); setDate(now.date); }}>Сегодня</button>}
          <span className="day-count-ph"><b>{fmtHM(accounted)}</b><span>/ 24:00</span></span>
        </div>
        {empty && <div className="day-empty">{isToday ? 'Новый день — отметок пока нет.' : 'В этот день отметок нет.'} Тапни слот и выбери, что было.</div>}
        <div className="day-wrap ph">
          <div className="day-times" aria-hidden="true">
            {Array.from({ length: SLOTS }, (_, i) => <span key={i} className={i % 2 ? 'half' : ''}>{slotTime(i)}</span>)}
          </div>
          <div className="day-list" ref={listRef} onClick={onPhoneTap} role="grid" aria-label={`Слоты: ${dayTitle(date, now.date)}`}>
            {renderRows(shown, blocks, sel, catalog, rowH, true)}
            {split && (
              <>
                <div className="day-split" style={{ top: split.start * rowH - 4, height: (split.end - split.start) * rowH + 8 }} aria-hidden="true" />
                <span className="day-split-label" style={{ top: split.start * rowH - 12 }}>разбит на слоты</span>
              </>
            )}
            {selRuns.map((r) => <div key={r.start} className="day-sel" style={{ top: r.start * rowH, height: (r.end - r.start) * rowH }} aria-hidden="true" />)}
            {nowSlot >= 0 && (
              <div className="day-now" style={{ top: now.min / SLOT_MIN * rowH }} aria-label={`Сейчас ${nowText(now.min)}`}>
                <span className="tag">{nowText(now.min)}</span><span className="line" />
              </div>
            )}
          </div>
        </div>
        {sheetEl}
      </>
    );
  }

  return (
    <>
      <div className="day-bar">
        <span className="day-title">{dayTitle(date, now.date)}</span>
        <button type="button" className="day-nav" aria-label="Предыдущий день" onClick={() => { reset(); setDate((d) => dayAdd(d, -1)); }}>
          <Icon name="back" size={14} width={2.2} />
        </button>
        <button type="button" className="day-nav" aria-label="Следующий день" onClick={() => { reset(); setDate((d) => dayAdd(d, 1)); }}>
          <Icon name="chevronRight" size={14} width={2.2} />
        </button>
        <button type="button" className="day-nav" aria-label="Выбрать дату" onClick={(e) => setCal(e.currentTarget)}>
          <Icon name="when" size={15} width={1.9} />
        </button>
        <button type="button" className={'day-today' + (isToday ? '' : ' away')} onClick={() => { reset(); setDate(now.date); }}>Сегодня</button>
        <div className="day-count">
          <span className="lbl">Учтено</span>
          <span className="num">{fmtHM(accounted)}</span>
          <span className="of">/ 24:00</span>
          <span className="bar"><span style={{ width: `${pct}%` }} /></span>
        </div>
      </div>
      {cal && <DatePicker value={date} anchor={cal} title="Дата" onClose={() => setCal(null)} onPick={(d) => { if (d) { reset(); setDate(d); } }} />}

      {empty && (
        <div className="day-empty">
          <Icon name="time" size={16} color="#5F635C" width={1.9} />
          {isToday ? 'Новый день — отметок пока нет.' : 'В этот день отметок нет.'} Нажми на слот или выдели несколько и выбери, что было.
        </div>
      )}

      <div className="day-wrap">
        <div className="day-times" aria-hidden="true">
          {Array.from({ length: SLOTS }, (_, i) => (
            <span key={i} className={i % 2 ? 'half' : ''}>{slotTime(i)}</span>
          ))}
        </div>
        <div className={'day-list' + (drag?.kind === 'fill' ? ' filling' : '')} ref={listRef} onMouseDown={onListDown}
          onMouseMove={(e) => { if (!selBlock) { if (hoverSel) setHoverSel(false); return; } const i = slotAt(e.clientY); const on = i >= selBlock.start - 1 && i <= selBlock.end; if (on !== hoverSel) setHoverSel(on); }}
          onMouseLeave={() => setHoverSel(false)}
          role="grid" aria-label={`Слоты: ${dayTitle(date, now.date)}`}>
          {renderRows(shown, blocks, sel, catalog, rowH, false)}

          {split && (
            <>
              <div className="day-split" style={{ top: split.start * rowH - 3, height: (split.end - split.start) * rowH + 6 }} aria-hidden="true" />
              <span className="day-split-label" style={{ top: split.start * rowH - 11 }}>разбит на слоты · клик вне — собрать</span>
            </>
          )}
          {selRuns.map((r) => (
            <div key={r.start} className="day-sel" style={{ top: r.start * rowH, height: (r.end - r.start) * rowH }} aria-hidden="true" />
          ))}
          {preview && <div className="day-preview" style={{ top: preview.start * rowH, height: (preview.end - preview.start) * rowH }} aria-hidden="true" />}
          {selBlock && !preview && (hoverSel || drag?.kind === 'fill') && (
            <>
              <span data-handle className="day-handle" style={{ top: selBlock.start * rowH - 5 }} aria-label="Протянуть вверх" role="separator" onMouseDown={startFill('top')} />
              <span data-handle className="day-handle" style={{ top: selBlock.end * rowH - 3 }} aria-label="Протянуть вниз" role="separator" onMouseDown={startFill('bottom')} />
            </>
          )}
          {preview && drag?.kind === 'fill' && (
            <span data-handle className="day-handle dark" style={{ top: (drag.edge === 'bottom' ? preview.end : preview.start) * rowH - 4 }} aria-hidden="true" />
          )}
          {nowSlot >= 0 && (
            <div className="day-now" style={{ top: now.min / SLOT_MIN * rowH }} aria-label={`Сейчас ${nowText(now.min)}`}>
              <span className="tag">{nowText(now.min)}</span>
              <span className="dot" /><span className="line" />
            </div>
          )}

          {popOpen && sel.length > 0 && (
            <MarkPop ref={popRef} head={selHead} current={current} block={blockSel} catalog={catalog}
              style={{ top: popTop }}
              onPick={(v) => applyValue(v)} onClear={() => applyValue(null)} onClose={() => { setPopOpen(false); }}
              onSplit={blockSel && selBlock && selBlock.end - selBlock.start > 1 ? () => {
                setSplit({ start: selBlock.start, end: selBlock.end }); setSel([]); setBlockSel(false); setPopOpen(false);
              } : undefined} />
          )}
        </div>
      </div>
    </>
  );
}

/** Строки дня: пустой слот — линия; блок — одна плашка на всю высоту с подписью в первом (видимом) слоте. */
function renderRows(shown: (SlotValue | null)[], blocks: Block[], sel: number[], catalog: ReturnType<typeof useCatalog>, rowH: number, phone: boolean) {
  const out: React.ReactNode[] = [];
  const selSet = new Set(sel);
  for (let i = 0; i < SLOTS; i++) {
    const v = shown[i];
    if (!v) {
      out.push(<div key={'e' + i} className={'day-empty-slot' + (selSet.has(i) ? ' is-sel' : '')} style={{ height: rowH }} />);
      continue;
    }
    const b = blocks.find((x) => x.start === i)!;
    const isPreview = b.value.category_id.endsWith(PREVIEW);
    const value = isPreview ? { ...b.value, category_id: b.value.category_id.slice(0, -PREVIEW.length) } : b.value;
    const cat = catalog.categories.find((c) => c.id === value.category_id);
    const path = valuePath(value, catalog);
    const n = b.end - b.start;
    out.push(
      <div key={'b' + i} className="day-block" style={{
        height: n * rowH, background: tint(cat?.color), boxShadow: `inset 4px 0 0 ${colorHex(cat?.color)}`, opacity: isPreview ? 0.55 : 1,
      }}>
        <div className="day-block-label">
          <span className="path">{path[0]}{path.length > 1 && <span className="sub"> · {path.slice(1).join(' · ')}</span>}</span>
          <span className="span">{n > 1 && !phone ? `${slotTime(b.start, false)}–${slotTime(b.end, false)} · ` : ''}<b>{fmtHM(n * SLOT_MIN)}</b></span>
        </div>
      </div>,
    );
    i = b.end - 1;
  }
  return out;
}


/** iPhone: выбор времени окончания с шагом 30 мин (до 24:00); выбранное — крупно на тёмной плашке. */
function EndWheel({ start, end, onPick }: { start: number; end: number; onPick: (end: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('[aria-selected="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' });
  }, []);
  const ends = Array.from({ length: SLOTS - start }, (_, k) => start + 1 + k);
  return (
    <div className="mp-wheel">
      <div className="mp-wheel-list" ref={ref} role="listbox" aria-label="До какого времени">
        {ends.map((e) => {
          const d = Math.abs(e - end);
          return (
            <button key={e} type="button" role="option" aria-selected={e === end} className={e === end ? 'on' : d === 1 ? 'near' : ''}
              onClick={() => onPick(e)}>{slotTime(e)}</button>
          );
        })}
      </div>
      <span className="mp-wheel-note">шаг 30 мин · до 24:00 · всё между заполнится</span>
    </div>
  );
}
