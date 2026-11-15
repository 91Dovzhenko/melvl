// Окно отметки (спецификация «Время», раздел 5; доска «Каскад»): одно тёмное окно, шаги сменяют друг друга.
// «Последние» → Категория → Направление → Проект → Этап. Клик / ↵ по строке — поставить и закрыть; «›» / → — глубже;
// ← / «‹» — назад; «Готово» — поставить набранное. Поля поиска нет: первые буквы молча фильтруют текущий шаг.
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { Icon } from '../../ui/icons';
import { colorHex } from '../../lib/time/palette';
import { isSelectable, isWritableValue, lastStageOf, recentValues, sameValue, valuePath, type Catalog } from '../../lib/time/day';
import type { SlotValue, TimeCategory, TimeDirection } from '../../lib/time/types';
import type { Project } from '../../lib/types';

type Step =
  | { kind: 'root' }
  | { kind: 'dir'; cat: TimeCategory }
  | { kind: 'proj'; cat: TimeCategory; dir: TimeDirection }
  | { kind: 'stage'; cat: TimeCategory; dir: TimeDirection; project: Project };

type Item = {
  key: string; label: string; sub?: string; color?: string; num?: number; last?: boolean; cur?: boolean;
  /** Значение, которое ставится по клику / ↵. */
  value: SlotValue;
  /** Шаг глубже (›), если есть. */
  next?: Step;
  group?: string;
};

const byOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;
const V = (category_id: string, direction_id: string | null = null, project_id: string | null = null, stage_id: string | null = null): SlotValue =>
  ({ category_id, direction_id, project_id, stage_id });
/** Совпадение по первым буквам любого слова. */
const matches = (text: string, q: string) => !q || text.toLowerCase().split(/[\s·_«»"(),.—-]+/).some((w) => w.startsWith(q));

export const MarkPop = forwardRef<HTMLDivElement, {
  head: string; current: SlotValue | null; block: boolean; catalog: Catalog; style: React.CSSProperties;
  onPick: (v: SlotValue) => void; onClear: () => void; onSplit?: () => void; onClose: () => void;
  /** iPhone: нижний лист — крупные строки, «Готово» в шапке, сверху строка «до …». */
  sheet?: boolean;
  /** Над «Последними» (iPhone): «13:30 → до 14:00 ›» и длительности. */
  top?: React.ReactNode;
  /** Вместо списков (iPhone): выбор времени окончания. */
  wheel?: React.ReactNode;
}>(function MarkPop({ head, current, block, catalog, style, onPick, onClear, onSplit, onClose, sheet, top, wheel }, ref) {
  const store = useStore();
  const [step, setStep] = useState<Step>({ kind: 'root' });
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const cats = useMemo(() => store.time_categories.filter((c) => !c.deleted_at && c.status === 'active').sort(byOrder), [store.time_categories]);
  const dirsOf = (catId: string) => store.time_directions.filter((d) => d.category_id === catId && !d.deleted_at && d.status === 'active').sort(byOrder);
  const stagesOf = (dirId: string) => store.time_stages.filter((s) => s.direction_id === dirId && !s.deleted_at && s.status === 'active').sort(byOrder);
  /** Шаг «Проект»: область указана — только её открытые проекты; нет — все открытые, по группам областей. */
  const projectsOf = (dir: TimeDirection): { p: Project; group?: string }[] => {
    const open = store.projects.filter((p) => !p.deleted_at && p.status === 'open');
    if (dir.area_id) return open.filter((p) => p.area_id === dir.area_id).sort(byOrder).map((p) => ({ p }));
    const areas = store.areas.filter((a) => !a.deleted_at).sort(byOrder);
    const loose = open.filter((p) => !p.area_id || !areas.some((a) => a.id === p.area_id)).sort(byOrder).map((p) => ({ p, group: 'Без области' }));
    return [...loose, ...areas.flatMap((a) => open.filter((p) => p.area_id === a.id).sort(byOrder).map((p) => ({ p, group: a.name || 'Без названия' })))];
  };

  const recents = useMemo(() => {
    const r = recentValues(store.time_slots, catalog, 4);
    // Клик по блоку: текущее значение — первым, с галочкой.
    if (current && isSelectable(current, catalog)) return [current, ...r.filter((v) => !sameValue(v, current))].slice(0, 4);
    return r;
  }, [store.time_slots, catalog, current]);

  const items: Item[] = useMemo(() => {
    const ql = q.toLowerCase();
    if (step.kind === 'root') {
      if (ql) {
        // На первом шаге буквы ищут по всем уровням: категории и направления.
        const out: Item[] = [];
        for (const c of cats) {
          if (matches(c.name, ql)) out.push({ key: c.id, label: c.name, color: colorHex(c.color), value: V(c.id), next: dirsOf(c.id).length ? { kind: 'dir', cat: c } : undefined });
          for (const d of dirsOf(c.id)) if (matches(d.name, ql)) {
            out.push({ key: d.id, label: c.name, sub: d.name, color: colorHex(c.color), value: V(c.id, d.id), next: projectsOf(d).length ? { kind: 'proj', cat: c, dir: d } : undefined });
          }
        }
        return out;
      }
      return [
        ...recents.map((v, i): Item => {
          const path = valuePath(v, catalog);
          const cat = catalog.categories.find((c) => c.id === v.category_id);
          return { key: 'r' + i, label: path[0], sub: path.slice(1).join(' · '), color: colorHex(cat?.color), value: v, cur: !!current && sameValue(v, current), group: 'recent' };
        }),
        ...cats.map((c): Item => ({ key: c.id, label: c.name, color: colorHex(c.color), value: V(c.id), next: dirsOf(c.id).length ? { kind: 'dir', cat: c } : undefined, group: 'cat' })),
      ];
    }
    if (step.kind === 'dir') {
      return dirsOf(step.cat.id).filter((d) => matches(d.name, ql)).map((d) => ({
        key: d.id, label: d.name, value: V(step.cat.id, d.id), next: projectsOf(d).length ? { kind: 'proj', cat: step.cat, dir: d } as Step : undefined,
      }));
    }
    if (step.kind === 'proj') {
      const st = stagesOf(step.dir.id);
      return projectsOf(step.dir).filter(({ p }) => matches(p.name, ql)).map(({ p, group }) => ({
        key: p.id, label: p.name || 'Новый проект', group, value: V(step.cat.id, step.dir.id, p.id),
        next: st.length ? { kind: 'stage', cat: step.cat, dir: step.dir, project: p } as Step : undefined,
      }));
    }
    const st = stagesOf(step.dir.id);
    const last = lastStageOf(store.time_slots, step.project.id, st.map((s) => s.id));
    return st.map((s, i) => ({ s, i })).filter(({ s }) => matches(s.name, ql)).map(({ s, i }) => ({
      key: s.id, label: s.name, num: i + 1, last: s.id === last, value: V(step.cat.id, step.dir.id, step.project.id, s.id),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, q, cats, recents, store.time_directions, store.time_stages, store.projects, store.areas, store.time_slots, catalog, current]);

  // Фокус при смене шага / фильтра: на этапе — последний использованный, иначе первая строка.
  useEffect(() => {
    const li = items.findIndex((i) => i.last);
    setFocus(li >= 0 ? li : 0);
  }, [step, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.querySelector('[data-focus="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [focus, step]);

  const pick = (v: SlotValue) => { if (isWritableValue(v)) onPick(v); };
  const go = (s: Step) => { setStep(s); setQ(''); };
  const back = () => {
    setQ('');
    setStep((s) => s.kind === 'stage' ? { kind: 'proj', cat: s.cat, dir: s.dir } : s.kind === 'proj' ? { kind: 'dir', cat: s.cat } : { kind: 'root' });
  };
  /** «Готово» — то, что набрано на текущем шаге. */
  const doneValue: SlotValue | null = step.kind === 'dir' ? V(step.cat.id) : step.kind === 'proj' ? V(step.cat.id, step.dir.id)
    : step.kind === 'stage' ? V(step.cat.id, step.dir.id, step.project.id) : null;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (sheet || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === 'Escape') { stop(); if (q) setQ(''); else onClose(); return; }
      if (k === 'ArrowDown') { stop(); setFocus((f) => Math.min(items.length - 1, f + 1)); return; }
      if (k === 'ArrowUp') { stop(); setFocus((f) => Math.max(0, f - 1)); return; }
      if (k === 'Enter') { stop(); const it = items[focus]; if (it) pick(it.value); else if (doneValue) pick(doneValue); return; }
      if (k === 'ArrowRight') { stop(); const it = items[focus]; if (it?.next) go(it.next); return; }
      if (k === 'ArrowLeft') { stop(); if (step.kind !== 'root') back(); return; }
      if (k === 'Backspace' && q) { stop(); setQ((x) => x.slice(0, -1)); return; }
      if (k === 'Delete' || k === 'Backspace') { stop(); onClear(); return; }
      if (k.length === 1 && /\S| /.test(k)) { stop(); setQ((x) => (x + k.toLowerCase()).trimStart()); }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });

  const crumb = step.kind === 'dir' ? step.cat.name : step.kind === 'proj' ? `${step.cat.name} · ${step.dir.name}`
    : step.kind === 'stage' ? `${step.cat.name} · ${step.dir.name} · ${step.project.name}` : '';
  const area = step.kind === 'proj' && step.dir.area_id ? store.areas.find((a) => a.id === step.dir.area_id) : null;
  const label = step.kind === 'dir' ? 'НАПРАВЛЕНИЕ' : step.kind === 'proj' ? (area ? `ПРОЕКТ · ОБЛАСТЬ «${(area.name || '').toUpperCase()}»` : 'ПРОЕКТ') : 'ЭТАП';
  const doneHint = step.kind === 'dir' ? `Готово — «${step.cat.name}»` : step.kind === 'proj' ? `Готово — «${step.dir.name}» без проекта`
    : step.kind === 'stage' ? 'Готово — без этапа' : '';

  const row = (it: Item, idx: number) => (
    <div key={it.key} className={'mp-row' + (idx === focus ? ' focus' : '')} data-focus={idx === focus}
      onMouseEnter={() => setFocus(idx)}>
      <button type="button" className="mp-main" onClick={() => pick(it.value)}>
        {it.color && <span className="mp-dot" style={{ background: it.color }} />}
        {it.num !== undefined && <span className="mp-num">{it.num}</span>}
        <span className="mp-text">{it.label}{it.sub && <span className="mp-sub"> · {it.sub}</span>}</span>
        {it.last && <span className="mp-last">последний</span>}
        {it.cur && <Icon name="check" size={14} color="#C5F25A" width={2.6} />}
        {idx === focus && !it.cur && it.group === 'recent' && <span className="mp-kb">↵</span>}
      </button>
      {it.next && (
        <button type="button" className="mp-more" aria-label={`Дальше: ${it.sub || it.label}`} onClick={() => go(it.next!)}>
          <Icon name="chevronRight" size={12} color="#8E9289" width={2.4} />
        </button>
      )}
    </div>
  );

  const groups: React.ReactNode[] = [];
  if (step.kind === 'root' && !q) {
    const rec = items.filter((i) => i.group === 'recent');
    const cat = items.filter((i) => i.group === 'cat');
    if (rec.length) {
      groups.push(<span key="rh" className="mp-cap">ПОСЛЕДНИЕ</span>, ...rec.map((it) => row(it, items.indexOf(it))), <div key="s1" className="mp-sep" />);
    }
    groups.push(<span key="ch" className="mp-cap">КАТЕГОРИЯ</span>,
      <div key="cg" className="mp-grid">{cat.map((it) => row(it, items.indexOf(it)))}</div>);
  } else {
    let lastGroup: string | undefined;
    items.forEach((it, i) => {
      if (step.kind === 'proj' && it.group && it.group !== lastGroup) groups.push(<span key={'g' + it.group} className="mp-group">{it.group.toUpperCase()}</span>);
      lastGroup = it.group;
      groups.push(row(it, i));
    });
    if (!items.length) groups.push(<span key="none" className="mp-empty">{q ? `Нет на «${q}»` : 'Пусто'}</span>);
  }

  return (
    <div ref={ref} className={'mark-pop' + (sheet ? ' msheet' : '')} role="dialog" aria-label="Что отметить" data-keep-card style={style}
      onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {sheet && <span className="mp-handle" aria-hidden="true" />}
      {step.kind === 'root' ? (
        sheet ? (
          <div className="mp-sheet-head"><span>{head}</span><button type="button" onClick={onClose}>Готово</button></div>
        ) : <div className="mp-head">{head}</div>
      ) : (
        <div className="mp-crumb">
          <button type="button" className="mp-back" aria-label="Назад" onClick={back}><Icon name="back" size={12} color="#FFFFFF" width={2.4} /></button>
          <span className="mp-dot" style={{ background: colorHex(step.cat.color), marginLeft: 4 }} />
          <span className="mp-crumb-text">{crumb}</span>
        </div>
      )}
      {step.kind === 'root' && top}
      {step.kind !== 'root' && <span className="mp-cap">{label}</span>}
      {step.kind === 'root' && wheel ? wheel : <div className="mp-list" ref={listRef}>{groups}</div>}
      {step.kind !== 'root' && doneValue && (
        <div className="mp-done">
          <span>{doneHint}</span>
          <button type="button" className="tset-lime sm" onClick={() => pick(doneValue)}>Готово</button>
        </div>
      )}
      {step.kind === 'root' && !wheel && (
        <>
          {!sheet && <div className="mp-sep" />}
          {onSplit && (
            <button type="button" className="mp-act" onClick={onSplit}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v4H5z M5 15h14v4H5z M12 9v6" stroke="#B4B8B0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ flex: 1 }}>Разбить на слоты</span>
            </button>
          )}
          <button type="button" className="mp-act muted" onClick={onClear}>
            <span style={{ flex: 1 }}>{block ? 'Очистить блок' : 'Очистить'}</span><span className="mp-key">⌫</span>
          </button>
        </>
      )}
    </div>
  );
});
