// Перетаскивание на Mac (19_ТЗ, спецификация, раздел 19). Без внешних библиотек: pointer-события.
// Списки регистрируются (useDndList), строки начинают перетаскивание (useDragSource).
// Пока тянут: исходная строка скрыта, в списке-цели — плашка (data-dnd-slot), строки разъезжаются (FLIP, 150 мс),
// копия строки едет у курсора (клон DOM). Отпустил — копия «садится» на плашку (180 мс) и только потом меняются данные;
// нельзя / Esc — копия возвращается на исходное место (200 мс). «Уменьшить движение» — без анимации.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../ui/useIsPhone';

export type DragKind = 'task' | 'project' | 'area';
export type DragItem = { kind: DragKind; id: string };
export type SlotResult = { index: number; valid: boolean } | null;

export type ListSpec = {
  kind: DragKind;
  /** Элементы списка в порядке показа. */
  ids: string[];
  /** Куда встанет плашка, если курсор указывает на позицию desired среди остальных; null — сюда нельзя. */
  resolve: (item: DragItem, desired: number, others: string[]) => SlotResult;
  /** Отпустили над допустимым местом. */
  drop: (item: DragItem, index: number, others: string[]) => void;
};

/** Цель в боковом меню для задачи (раздел, область, проект): data-drop-nav на пункте. */
export type NavSpec = {
  /** Что меняет бросок задачи на пункт; null — пункт не цель (ничего не изменится). */
  accepts: (taskId: string, key: string) => boolean;
  drop: (taskId: string, key: string) => void;
};

type Over = { list: string; index: number };
type View = {
  item: DragItem;
  origin: Over;
  over: Over | null;
  nav: string | null;
  faded: boolean;
  narrow: boolean;
};

type Api = {
  view: View | null;
  register: (id: string, spec: React.MutableRefObject<ListSpec>, el: React.RefObject<HTMLElement | null>) => () => void;
  setNav: (spec: NavSpec | null) => void;
  begin: (e: React.PointerEvent, item: DragItem, list: string, row: HTMLElement) => void;
};

const Ctx = createContext<Api | null>(null);
const THRESHOLD = 4;
const EDGE = 40;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = { shift: 150, land: 180, back: 200 };
/** Следующий кадр; в фоновой вкладке кадров нет — тогда по таймеру. */
const nextFrame = (fn: () => void) => {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 50);
};

type Live = {
  item: DragItem; list: string; row: HTMLElement;
  sx: number; sy: number; ox: number; oy: number; width: number;
  x: number; y: number; started: boolean; phase: 'drag' | 'settle';
  clone?: HTMLElement;
};

export function DndProvider({ children }: { children: React.ReactNode }) {
  const phone = useIsPhone();
  const lists = useRef(new Map<string, { spec: React.MutableRefObject<ListSpec>; el: React.RefObject<HTMLElement | null> }>());
  const navRef = useRef<NavSpec | null>(null);
  const live = useRef<Live | null>(null);
  const viewRef = useRef<View | null>(null);
  const [view, setViewState] = useState<View | null>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const setView = useCallback((v: View | null) => {
    const p = viewRef.current;
    // Без лишних перерисовок: курсор двигается постоянно, а место и цель меняются редко.
    if (p && v && p.item === v.item && p.nav === v.nav && p.faded === v.faded && p.narrow === v.narrow
      && p.over?.list === v.over?.list && p.over?.index === v.over?.index && p.origin === v.origin) return;
    viewRef.current = v; setViewState(v);
  }, []);


  const register = useCallback((id: string, spec: React.MutableRefObject<ListSpec>, el: React.RefObject<HTMLElement | null>) => {
    lists.current.set(id, { spec, el });
    return () => { if (lists.current.get(id)?.spec === spec) lists.current.delete(id); };
  }, []);
  const setNav = useCallback((spec: NavSpec | null) => { navRef.current = spec; }, []);

  const placeCopy = () => {
    const d = live.current, c = copyRef.current;
    if (!d || !c) return;
    c.style.transform = `translate(${d.x - (viewRef.current?.narrow ? Math.min(d.ox, 40) : d.ox)}px, ${d.y - d.oy}px)`;
  };

  /** Строки списка (без перетаскиваемой), сверху вниз. */
  const rowsOf = (el: HTMLElement, skip: string) =>
    [...el.querySelectorAll<HTMLElement>('[data-dnd-row]')].filter((r) => r.dataset.dndRow !== skip && r.parentElement?.closest('[data-dnd-list]') === el);

  const compute = () => {
    const d = live.current, v = viewRef.current;
    if (!d || !v || d.phase !== 'drag') return;
    const { x, y, item } = d;
    // Задача над боковым меню: копия сужается, плашки в списках нет, цель — пункт меню.
    const sidebar = document.querySelector('.sidebar');
    const sb = sidebar?.getBoundingClientRect();
    if (item.kind === 'task' && sb && x >= sb.left && x <= sb.right && y >= sb.top && y <= sb.bottom) {
      const hit = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-nav]');
      const key = hit?.dataset.dropNav ?? null;
      const ok = !!key && !!navRef.current?.accepts(item.id, key);
      setView({ ...v, over: null, nav: ok ? key : null, faded: !ok, narrow: true });
      return;
    }
    // Список того же рода под курсором (самый вложенный).
    let best: { id: string; el: HTMLElement; spec: ListSpec; area: number } | null = null;
    for (const [id, { spec, el }] of lists.current) {
      const node = el.current;
      if (!node || spec.current.kind !== item.kind) continue;
      const r = node.getBoundingClientRect();
      const pad = 6;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
      const area = r.width * r.height;
      if (!best || area < best.area) best = { id, el: node, spec: spec.current, area };
    }
    if (!best) {
      // Шапка, пустое поле: копия бледнее, плашка остаётся где была; отпустил — возврат.
      setView({ ...v, nav: null, faded: true, narrow: false, over: v.over ?? v.origin });
      return;
    }
    const rows = rowsOf(best.el, item.id);
    const others = rows.map((r) => r.dataset.dndRow!);
    let desired = 0;
    for (const r of rows) { const rr = r.getBoundingClientRect(); if (y > rr.top + rr.height / 2) desired++; }
    // Над шапкой списка (область в меню) — место в конце её списка.
    const head = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-dnd-head]');
    if (head && best.el.contains(head)) desired = rows.length;
    const res = best.spec.resolve(item, desired, others);
    if (!res) {
      setView({ ...v, nav: null, faded: true, narrow: false, over: v.over ?? v.origin });
      return;
    }
    const over = { list: best.id, index: res.index };
    const same = v.over && v.over.list === over.list && v.over.index === over.index;
    setView({ ...v, nav: null, narrow: false, faded: !res.valid, over: same ? v.over : over });
  };

  // Автопрокрутка у края списка: ближе к краю — быстрее.
  const scrollLoop = () => {
    const d = live.current;
    if (!d || !d.started || d.phase !== 'drag') return;
    // Список задач прокручивает окно, проекты и области — боковое меню (у него своя прокрутка).
    const side = d.item.kind !== 'task' ? document.querySelector<HTMLElement>('.sidebar') : null;
    const r = side ? side.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    let dy = 0;
    if (d.y < r.top + EDGE) dy = -Math.ceil((Math.min(EDGE, r.top + EDGE - d.y) / EDGE) * 14);
    else if (d.y > r.bottom - EDGE) dy = Math.ceil((Math.min(EDGE, d.y - (r.bottom - EDGE)) / EDGE) * 14);
    if (dy) {
      const before = side ? side.scrollTop : window.scrollY;
      if (side) side.scrollTop += dy; else window.scrollBy(0, dy);
      if ((side ? side.scrollTop : window.scrollY) !== before) compute();
    }
    raf.current = requestAnimationFrame(scrollLoop);
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf.current);
    document.body.classList.remove('dnd-on');
    live.current = null;
    setView(null);
  };

  /** Копия едет к прямоугольнику (плашке или исходному месту), потом done. */
  const settle = (rect: DOMRect | null, ms: number, done: () => void) => {
    const c = copyRef.current, d = live.current;
    if (!d) return;
    d.phase = 'settle';
    cancelAnimationFrame(raf.current);
    if (!c || !rect || reduced()) { done(); return; }
    c.style.transition = `transform ${ms}ms ease-out, opacity ${ms}ms ease-out`;
    c.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    c.style.opacity = '1';
    let fired = false;
    const fin = () => { if (!fired) { fired = true; done(); } };
    c.addEventListener('transitionend', fin, { once: true });
    setTimeout(fin, ms + 60);
  };

  const slotRect = () => document.querySelector<HTMLElement>('[data-dnd-slot]')?.getBoundingClientRect() ?? null;

  const goBack = () => {
    const v = viewRef.current;
    if (!v) { cleanup(); return; }
    // Плашка встаёт на исходное место, копия едет туда.
    setView({ ...v, over: v.origin, nav: null, faded: false, narrow: false });
    nextFrame(() => settle(slotRect(), T.back, cleanup));
  };

  const finish = () => {
    const d = live.current, v = viewRef.current;
    if (!d || !v) { cleanup(); return; }
    if (v.nav && navRef.current) {
      const key = v.nav;
      cleanup();
      navRef.current.drop(d.item.id, key);
      return;
    }
    if (!v.over || v.faded) { goBack(); return; }
    const entry = lists.current.get(v.over.list);
    if (!entry || !entry.el.current) { goBack(); return; }
    const others = rowsOf(entry.el.current, d.item.id).map((r) => r.dataset.dndRow!);
    const over = v.over;
    const unchanged = over.list === v.origin.list && over.index === v.origin.index;
    settle(slotRect(), T.land, () => {
      if (!unchanged) entry.spec.current.drop(d.item, over.index, others);
      cleanup();
    });
  };

  function onMove(e: PointerEvent) {
    const d = live.current;
    if (!d) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.started) {
      if (Math.hypot(d.x - d.sx, d.y - d.sy) < THRESHOLD) return;
      d.started = true;
      document.body.classList.add('dnd-on');
      window.getSelection()?.removeAllRanges();
      const entry = lists.current.get(d.list);
      const index = Math.max(0, entry?.spec.current.ids.indexOf(d.item.id) ?? 0);
      const origin = { list: d.list, index };
      setView({ item: d.item, origin, over: origin, nav: null, faded: false, narrow: false });
      raf.current = requestAnimationFrame(scrollLoop);
    }
    if (d.phase !== 'drag') return;
    placeCopy();
    compute();
  }

  function onUp() {
    const d = live.current;
    if (!d) return;
    if (!d.started) { cleanup(); return; }
    // Клик после перетаскивания не должен выделять строку или открывать проект.
    const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    if (d.phase === 'drag') finish();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !live.current?.started) return;
    e.preventDefault();
    e.stopPropagation();
    if (live.current.phase === 'drag') goBack();
  }

  const begin = useCallback((e: React.PointerEvent, item: DragItem, list: string, row: HTMLElement) => {
    if (phone || live.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target as HTMLElement;
    // Чекбокс и поля — не за них.
    if (t.closest('.cb, input, textarea, select, [contenteditable="true"], a.note-link, [data-no-drag]')) return;
    const r = row.getBoundingClientRect();
    live.current = { item, list, row, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, width: r.width, x: e.clientX, y: e.clientY, started: false, phase: 'drag' };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Копия строки: клон исходной строки (чипы внутри — на белом, без выделения и навыка).
  useLayoutEffect(() => {
    const d = live.current, c = copyRef.current;
    if (!view || !d || !c) return;
    if (!d.clone) {
      // Область тянут за шапку: копия — только шапка.
      const src = d.item.kind === 'area' ? d.row.querySelector<HTMLElement>('[data-dnd-head]') ?? d.row : d.row;
      const clone = src.cloneNode(true) as HTMLElement;
      clone.classList.remove('selected', 'active');
      clone.removeAttribute('data-dnd-row');
      clone.querySelectorAll('.skill-hover').forEach((n) => n.remove());
      d.clone = clone;
      c.replaceChildren(clone);
      c.style.transition = 'none';
      placeCopy();
    }
    c.style.width = (view.narrow ? Math.min(300, d.width) : d.width) + 'px';
    c.style.opacity = view.faded ? '0.6' : '0.94';
    placeCopy();
  });

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo<Api>(() => ({ view, register, setNav, begin }), [view, register, setNav, begin]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {view && createPortal(
        <div className="dnd-layer" aria-hidden="true">
          <div ref={copyRef} className={'dnd-copy' + (view.narrow ? ' narrow' : '') + (view.item.kind !== 'task' ? ' nav' : '')} />
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useDnd() {
  return useContext(Ctx);
}

/** Регистрация списка; возвращает ref контейнера, где плашка и какую строку скрыть. */
export function useDndList(id: string, spec: ListSpec, enabled = true) {
  const api = useContext(Ctx);
  const el = useRef<HTMLElement | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => (api && enabled ? api.register(id, specRef, el) : undefined), [api?.register, id, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = api?.view ?? null;
  const active = !!v && v.item.kind === spec.kind;
  useFlip(el, v);
  return {
    ref: el,
    /** Перетаскиваемый элемент (его строку не показываем). */
    hidden: active ? v!.item.id : null,
    /** Позиция плашки среди остальных строк этого списка или null. */
    slot: active && v!.over && v!.over.list === id ? v!.over.index : null,
  };
}

/** Начать перетаскивание строки (Mac). */
export function useDragSource(item: DragItem | null, list: string) {
  const api = useContext(Ctx);
  const phone = useIsPhone();
  return useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!api || !item || phone) return;
    api.begin(e, item, list, (e.currentTarget.closest('[data-dnd-row]') as HTMLElement | null) ?? e.currentTarget);
  }, [api, item?.kind, item?.id, list, phone]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Строки разъезжаются плавно: запоминаем положение до перерисовки и доводим разницу за 150 мс. */
function useFlip(el: React.RefObject<HTMLElement | null>, v: View | null) {
  const pos = useRef(new Map<string, number>());
  const wasActive = useRef(false);
  useLayoutEffect(() => {
    const node = el.current;
    const active = !!v || wasActive.current;
    wasActive.current = !!v;
    if (!node) return;
    const rows = [...node.querySelectorAll<HTMLElement>(':scope > [data-dnd-row], :scope > [data-dnd-slot]')];
    const next = new Map<string, number>();
    for (const r of rows) next.set(r.dataset.dndRow ?? 'slot', r.offsetTop);
    if (active && !reduced()) {
      for (const r of rows) {
        const key = r.dataset.dndRow;
        if (!key) continue;
        const was = pos.current.get(key);
        const now = next.get(key)!;
        if (was === undefined || was === now) continue;
        r.style.transition = 'none';
        r.style.transform = `translateY(${was - now}px)`;
        void r.offsetHeight;
        r.style.transition = `transform ${T.shift}ms ease-out`;
        r.style.transform = '';
      }
    }
    pos.current = next;
  });
}
