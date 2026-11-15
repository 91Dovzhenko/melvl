// Настройки → «Учёт времени» (21_ТЗ, 5.5; холст «Время», доски «Настройки» и «С нуля 1–6»).
// Одно дерево: категория (цвет, сворачивается) › направление (название, норма, область задач, этапы).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../lib/store';
import { Icon } from '../../ui/icons';
import { Pop, PopItem, PopSep, type Anchor } from '../../ui/Pop';
import { Select } from '../../ui/Select';
import { useIsPhone } from '../../ui/useIsPhone';
import { plural } from '../../lib/growth/format';
import { PALETTE, colorHex } from '../../lib/time/palette';
import { usageMin, type CatalogKind } from '../../lib/time/catalog';
import { fmtHM } from '../../lib/time/format';
import type { NormType, TimeCategory, TimeDirection, TimeStage } from '../../lib/time/types';
import './time.css';

const byOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;
const nextOrder = (rows: { sort_order: number }[]) => Math.max(0, ...rows.map((r) => r.sort_order)) + 1;

/** «6:00», «6», «6:30», «100» → минуты; пусто / мусор — null. */
export function parseHM(s: string): number | null {
  const m = s.trim().replace(',', ':').replace('.', ':').match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const min = Number(m[2] ?? 0);
  if (min >= 60) return null;
  return Number(m[1]) * 60 + min;
}

type Menu =
  | { kind: 'category'; row: TimeCategory; anchor: Anchor }
  | { kind: 'direction'; row: TimeDirection; anchor: Anchor }
  | { kind: 'stage'; row: TimeStage; anchor: Anchor }
  | { kind: 'move'; row: TimeDirection; anchor: Anchor }
  | { kind: 'color'; row: TimeCategory; anchor: Anchor };

type Deleting = { kind: CatalogKind; id: string; name: string; minutes: number };

export function TimeSettingsSection() {
  const store = useStore();
  const phone = useIsPhone();
  const cats = store.time_categories.filter((c) => !c.deleted_at).sort(byOrder);
  const dirs = store.time_directions.filter((d) => !d.deleted_at).sort(byOrder);
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set());
  const [openDir, setOpenDir] = useState<string | null>(null);
  const [newDir, setNewDir] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);

  const toggleCat = (id: string) => setOpenCats((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const openCat = (id: string) => setOpenCats((s) => new Set(s).add(id));

  /** Выше / Ниже — обмен местами с соседом в том же списке. */
  const move = <T extends { id: string; sort_order: number }>(table: 'time_categories' | 'time_directions' | 'time_stages', list: T[], row: T, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.id === row.id);
    const other = list[i + dir];
    if (!other) return;
    store.withUndo('Порядок изменён', () => {
      store.patch(table, row.id, { sort_order: other.sort_order } as never);
      store.patch(table, other.id, { sort_order: row.sort_order } as never);
    }, undefined, true);
  };

  /** «Удалить»: с часами — окно «В архив», без часов — сразу, с «Отменить». */
  const askDelete = (kind: CatalogKind, id: string, name: string) => {
    const minutes = usageMin(store.time_slots, kind, id);
    if (minutes > 0) { setDeleting({ kind, id, name, minutes }); return; }
    const label = kind === 'category' ? 'Категория удалена' : kind === 'direction' ? 'Направление удалено' : 'Этап удалён';
    store.withUndo(label, () => {
      if (kind === 'category') {
        for (const d of store.time_directions.filter((x) => x.category_id === id && !x.deleted_at)) removeDirection(d.id);
        store.remove('time_categories', id);
      } else if (kind === 'direction') removeDirection(id);
      else store.remove('time_stages', id);
    });
  };
  const removeDirection = (id: string) => {
    for (const s of store.time_stages.filter((x) => x.direction_id === id && !x.deleted_at)) store.remove('time_stages', s.id);
    store.remove('time_directions', id);
  };

  const addDirection = (cat: TimeCategory) => {
    const siblings = dirs.filter((d) => d.category_id === cat.id);
    const d = store.insert('time_directions', { category_id: cat.id, name: '', sort_order: nextOrder(siblings) });
    openCat(cat.id);
    setOpenDir(d.id);
    setNewDir(d.id);
  };
  /** Закрыть направление: новое без названия — не сохраняем. */
  const closeDir = (id: string) => {
    const d = store.time_directions.find((x) => x.id === id);
    if (d && newDir === id && !d.name.trim()) removeDirection(id);
    setNewDir(null);
    setOpenDir((cur) => (cur === id ? null : cur));
  };

  const empty = !store.loading && cats.length === 0 && !addingCat;

  return (
    <>
      {!phone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className="set-h2">Учёт времени</h2>
        </div>
      )}
      <p className="set-sub" style={{ lineHeight: 1.5, margin: phone ? '0 4px' : 0 }}>
        Слот отмечается так: категория → направление → проект задач → этап. Проекты берутся из задач по «Области задач», этапы задаются у направления.
      </p>

      {empty ? (
        <div className="tset-empty">
          <span style={{ fontSize: 16, fontWeight: 800 }}>Категорий пока нет</span>
          <span className="set-sub" style={{ maxWidth: 420, lineHeight: 1.5 }}>
            Начни с крупного: «Работа», «Блог», «Сон». Внутри категории можно завести направления — если хочешь видеть проекты и этапы.
          </span>
          <button type="button" className="tset-lime" onClick={() => setAddingCat(true)}>
            <Icon name="plus" size={14} width={2.2} />Категория
          </button>
        </div>
      ) : (
        <>
          <div className={phone ? 'phone-card tset-tree' : 'set-card tset-tree'}>
            {cats.map((c, ci) => {
              const own = dirs.filter((d) => d.category_id === c.id);
              const open = openCats.has(c.id);
              const archived = c.status === 'archived';
              return (
                <div key={c.id} className="tset-cat" style={{ borderTop: ci ? '1px solid #F0F1EC' : 0 }}>
                  {renaming === c.id ? (
                    <CategoryEdit initial={c} onDone={(name, color) => {
                      setRenaming(null);
                      if (name && (name !== c.name || color !== c.color)) store.patch('time_categories', c.id, { name, color });
                    }} onCancel={() => setRenaming(null)} />
                  ) : (
                    <div className={'tset-cat-row' + (open ? ' open' : '')} onClick={() => toggleCat(c.id)}
                      onContextMenu={(e) => { if (phone) return; e.preventDefault(); setMenu({ kind: 'category', row: c, anchor: { x: e.clientX, y: e.clientY } }); }}>
                      <button type="button" className="tset-swatch" aria-label={`Цвет «${c.name}»`} title="Сменить цвет"
                        style={{ background: colorHex(c.color) }}
                        onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'color', row: c, anchor: e.currentTarget }); }} />
                      <span className="tset-cat-name" style={{ color: archived ? '#8E9289' : undefined }} onDoubleClick={(e) => { e.stopPropagation(); setRenaming(c.id); }}>
                        {c.name || 'Без названия'}{archived && <span className="tset-tag">архив</span>}
                      </span>
                      <span className="tset-count">{own.length ? `${own.length} ${plural(own.length, 'направление', 'направления', 'направлений')}` : ''}</span>
                      <Icon name="chevronRight" size={12} color="#5F635C" width={2.4} style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
                      <MoreBtn label={c.name} onClick={(a) => setMenu({ kind: 'category', row: c, anchor: a })} />
                    </div>
                  )}
                  {open && own.map((d) => (
                    <DirectionRow key={d.id} d={d} open={openDir === d.id} isNew={newDir === d.id}
                      onToggle={() => (openDir === d.id ? closeDir(d.id) : (openDir && closeDir(openDir), setOpenDir(d.id)))}
                      onDone={() => closeDir(d.id)}
                      onMenu={(a) => setMenu({ kind: 'direction', row: d, anchor: a })}
                      onStageMenu={(s, a) => setMenu({ kind: 'stage', row: s, anchor: a })} />
                  ))}
                  {open && (
                    <button type="button" className="tset-add-dir" onClick={() => addDirection(c)}>
                      <Icon name="plus" size={14} color="#3D6A00" width={2.2} />Направление<span>· в «{c.name}»</span>
                    </button>
                  )}
                </div>
              );
            })}
            {addingCat && (
              <div style={{ borderTop: cats.length ? '1px solid #F0F1EC' : 0 }}>
                <CategoryEdit initial={null} onCancel={() => setAddingCat(false)} onDone={(name, color) => {
                  setAddingCat(false);
                  if (!name) return;
                  const c = store.insert('time_categories', { name, color, sort_order: nextOrder(store.time_categories) });
                  openCat(c.id);
                }} />
              </div>
            )}
          </div>
          {!addingCat && (
            <button type="button" className="tset-add-cat" onClick={() => setAddingCat(true)}>
              <Icon name="plus" size={14} width={2.2} />Категория
            </button>
          )}
          <p className="set-hint" style={{ color: '#5F635C' }}>
            Удалить можно и то, на что уже отмечено время: оно уйдёт в архив — не предлагается при отметке, но остаётся в отчётах и в отмеченных слотах.
          </p>
        </>
      )}

      {menu?.kind === 'category' && (() => {
        const c = menu.row;
        const close = () => setMenu(null);
        return (
          <Pop anchor={menu.anchor} onClose={close} variant="light" width={220} title={c.name}>
            <PopItem icon="pencil" label="Переименовать" onClick={() => { setRenaming(c.id); close(); }} />
            <PopItem icon="chevronUp" label="Выше" onClick={() => { move('time_categories', cats, c, -1); close(); }} />
            <PopItem icon="chevronDown" label="Ниже" onClick={() => { move('time_categories', cats, c, 1); close(); }} />
            <PopItem icon="someday" label={c.status === 'archived' ? 'Вернуть из архива' : 'В архив'} onClick={() => {
              store.withUndo(c.status === 'archived' ? 'Категория возвращена' : 'Категория в архиве',
                () => store.patch('time_categories', c.id, { status: c.status === 'archived' ? 'active' : 'archived' }));
              close();
            }} />
            <PopSep />
            <PopItem icon="trash" label="Удалить…" onClick={() => { close(); askDelete('category', c.id, c.name); }} />
          </Pop>
        );
      })()}
      {menu?.kind === 'direction' && (() => {
        const d = menu.row;
        const close = () => setMenu(null);
        const siblings = dirs.filter((x) => x.category_id === d.category_id);
        return (
          <Pop anchor={menu.anchor} onClose={close} variant="light" width={240} title={d.name}>
            <PopItem icon="chevronUp" label="Выше" onClick={() => { move('time_directions', siblings, d, -1); close(); }} />
            <PopItem icon="chevronDown" label="Ниже" onClick={() => { move('time_directions', siblings, d, 1); close(); }} />
            <PopItem icon="move" label="Перенести в категорию…" disabled={cats.length < 2} onClick={() => setMenu({ kind: 'move', row: d, anchor: menu.anchor })} />
            <PopItem icon="someday" label={d.status === 'archived' ? 'Вернуть из архива' : 'В архив'} onClick={() => {
              store.withUndo(d.status === 'archived' ? 'Направление возвращено' : 'Направление в архиве',
                () => store.patch('time_directions', d.id, { status: d.status === 'archived' ? 'active' : 'archived' }));
              close();
            }} />
            <PopSep />
            <PopItem icon="trash" label="Удалить…" onClick={() => { close(); askDelete('direction', d.id, d.name); }} />
          </Pop>
        );
      })()}
      {menu?.kind === 'move' && (
        <Pop anchor={menu.anchor} onClose={() => setMenu(null)} variant="light" width={240} title="Перенести в категорию">
          {!phone && <div className="pop-group-name" style={{ padding: '4px 8px' }}>Перенести «{menu.row.name}» в</div>}
          {cats.filter((c) => c.id !== menu.row.category_id).map((c) => (
            <button key={c.id} type="button" className="pop-item" onClick={() => {
              const d = menu.row;
              setMenu(null);
              // Слоты направления переезжают вместе с ним (в базе — on update cascade).
              store.withUndo(`«${d.name}» — в «${c.name}»`, () => store.patch('time_directions', d.id, { category_id: c.id }));
              openCat(c.id);
            }}>
              <span className="tset-dot" style={{ background: colorHex(c.color) }} />
              <span className="pop-label">{c.name}</span>
            </button>
          ))}
        </Pop>
      )}
      {menu?.kind === 'stage' && (() => {
        const s = menu.row;
        const close = () => setMenu(null);
        const siblings = store.time_stages.filter((x) => x.direction_id === s.direction_id && !x.deleted_at).sort(byOrder);
        return (
          <Pop anchor={menu.anchor} onClose={close} variant="light" width={220} title={s.name}>
            <PopItem icon="chevronUp" label="Выше" onClick={() => { move('time_stages', siblings, s, -1); close(); }} />
            <PopItem icon="chevronDown" label="Ниже" onClick={() => { move('time_stages', siblings, s, 1); close(); }} />
            <PopItem icon="pencil" label="Переименовать" onClick={() => { close(); window.dispatchEvent(new CustomEvent('tset-rename-stage', { detail: s.id })); }} />
            <PopSep />
            <PopItem icon="trash" label="Удалить…" onClick={() => { close(); askDelete('stage', s.id, s.name); }} />
          </Pop>
        );
      })()}
      {menu?.kind === 'color' && (
        <Pop anchor={menu.anchor} onClose={() => setMenu(null)} variant="light" width={248} title={`Цвет — «${menu.row.name}»`}>
          {!phone && <span className="tset-pal-title">Цвет — «{menu.row.name}»</span>}
          <Swatches value={menu.row.color} size={32} onPick={(color) => { store.patch('time_categories', menu.row.id, { color }); setMenu(null); }} />
        </Pop>
      )}
      {deleting && <ArchiveDialog del={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}

function MoreBtn({ label, onClick }: { label: string; onClick: (a: HTMLElement) => void }) {
  const phone = useIsPhone();
  return (
    <button type="button" className="tool" aria-label={`Действия с «${label}»`} title="Действия" style={{ width: phone ? 40 : 30, height: phone ? 40 : 30 }}
      onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget); }}>
      <Icon name="more" size={16} color="#3E423C" width={3} />
    </button>
  );
}

function Swatches({ value, size, onPick, bg = '#FFFFFF' }: { value: string; size: number; onPick: (key: string) => void; bg?: string }) {
  return (
    <div className="tset-swatches" style={{ gridTemplateColumns: size >= 30 ? 'repeat(5, 1fr)' : undefined }} role="radiogroup" aria-label="Цвет категории">
      {PALETTE.map((p) => (
        <button key={p.key} type="button" role="radio" aria-checked={p.key === value} aria-label={p.name} title={p.name}
          style={{ width: size, height: size, background: p.hex, boxShadow: p.key === value ? `0 0 0 2px ${bg}, 0 0 0 4px #15171A` : 'none' }}
          onClick={() => onPick(p.key)}>
          {p.key === value && size >= 30 && <Icon name="check" size={14} color="#FFFFFF" width={2.4} />}
        </button>
      ))}
    </div>
  );
}

/** Строка новой категории / переименования: поле названия, 10 кружков цвета, «Готово». */
function CategoryEdit({ initial, onDone, onCancel }: { initial: TimeCategory | null; onDone: (name: string, color: string) => void; onCancel: () => void }) {
  const store = useStore();
  const [name, setName] = useState(initial?.name ?? '');
  // Новой категории — первый свободный цвет палитры.
  const [color, setColor] = useState(() => initial?.color
    ?? PALETTE.find((p) => !store.time_categories.some((c) => !c.deleted_at && c.color === p.key))?.key ?? 'graphite');
  return (
    <form className="tset-cat-edit" onSubmit={(e) => { e.preventDefault(); onDone(name.trim(), color); }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="tset-swatch" style={{ background: colorHex(color), cursor: 'default' }} aria-hidden="true" />
        <input autoFocus className="tset-input strong" value={name} placeholder="Название категории" aria-label="Название категории"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} />
        <button type="submit" className="tset-lime sm" disabled={!name.trim()}>Готово</button>
      </div>
      <div className="tset-color-line">
        <span>Цвет</span>
        <Swatches value={color} size={22} bg="#F7F8F5" onPick={setColor} />
      </div>
    </form>
  );
}

const NORM_OPTS: { value: NormType; label: string }[] = [
  { value: 'none', label: 'Нет' }, { value: 'daily', label: 'В рабочий день' }, { value: 'monthly', label: 'В месяц' },
];

function dirMeta(d: TimeDirection, areaName: string | null, stages: number) {
  const norm = d.norm_type === 'daily' ? `${fmtHM(d.norm_min)} в рабочий день` : d.norm_type === 'monthly' ? `${fmtHM(d.norm_min)} в месяц` : 'без нормы';
  const parts = [norm, areaName ? `область «${areaName}»` : 'без области'];
  if (stages) parts.push(`${stages} ${plural(stages, 'этап', 'этапа', 'этапов')}`);
  return parts.join(' · ');
}

function DirectionRow({ d, open, isNew, onToggle, onDone, onMenu, onStageMenu }: {
  d: TimeDirection; open: boolean; isNew: boolean; onToggle: () => void; onDone: () => void;
  onMenu: (a: Anchor) => void; onStageMenu: (s: TimeStage, a: Anchor) => void;
}) {
  const store = useStore();
  const phone = useIsPhone();
  const stages = store.time_stages.filter((s) => s.direction_id === d.id && !s.deleted_at).sort(byOrder);
  const area = store.areas.find((a) => a.id === d.area_id) ?? null;
  const archived = d.status === 'archived';
  return (
    <>
      <div className={'tset-dir-row' + (open ? ' open' : '')} onClick={onToggle}
        onContextMenu={(e) => { if (phone) return; e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}>
        <Icon name="chevronRight" size={12} color="#5F635C" width={2.4} style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s', flexShrink: 0 }} />
        <span className="tset-dir-name" style={{ color: archived ? '#8E9289' : undefined }}>
          {d.name || 'Новое направление'}{archived && <span className="tset-tag">архив</span>}
        </span>
        <span className="tset-dir-meta">{isNew && !d.name ? 'новое направление' : dirMeta(d, area?.name ?? null, stages.length)}</span>
        <MoreBtn label={d.name} onClick={onMenu} />
      </div>
      {open && <DirectionForm d={d} stages={stages} isNew={isNew} onDone={onDone} onStageMenu={onStageMenu} />}
    </>
  );
}

function DirectionForm({ d, stages, isNew, onDone, onStageMenu }: {
  d: TimeDirection; stages: TimeStage[]; isNew: boolean; onDone: () => void; onStageMenu: (s: TimeStage, a: Anchor) => void;
}) {
  const store = useStore();
  const [name, setName] = useState(d.name);
  const [norm, setNorm] = useState(d.norm_min ? fmtHM(d.norm_min) : '');
  const [addingStage, setAddingStage] = useState(false);
  useEffect(() => { setName(d.name); }, [d.name]);
  useEffect(() => { setNorm(d.norm_min ? fmtHM(d.norm_min) : ''); }, [d.norm_min, d.norm_type]);
  const areas = useMemo(() => store.areas.filter((a) => !a.deleted_at).sort(byOrder), [store.areas]);
  const area = areas.find((a) => a.id === d.area_id) ?? null;
  const projects = store.projects.filter((p) => !p.deleted_at && p.status === 'open' && p.area_id === d.area_id).sort(byOrder);

  const saveName = () => { const n = name.trim(); if (n && n !== d.name) store.patch('time_directions', d.id, { name: n }); };
  const saveNorm = () => {
    const m = parseHM(norm);
    if (m === null) { setNorm(d.norm_min ? fmtHM(d.norm_min) : ''); return; }
    if (m !== d.norm_min) store.patch('time_directions', d.id, { norm_min: m });
    setNorm(fmtHM(m));
  };
  const setNormType = (t: NormType) => {
    if (t === d.norm_type) return;
    // Значение по умолчанию: 6:00 в рабочий день, 100:00 в месяц.
    const min = t === 'none' ? 0 : d.norm_type !== 'none' && d.norm_min ? d.norm_min : t === 'daily' ? 360 : 6000;
    store.patch('time_directions', d.id, { norm_type: t, norm_min: min });
  };

  return (
    <div className="tset-form" onClick={(e) => e.stopPropagation()}>
      <div className="tset-grid">
        <label className="tset-label" htmlFor={`dn-${d.id}`}>Название</label>
        <input id={`dn-${d.id}`} className="tset-input" value={name} autoFocus={isNew} placeholder="Например, Видео"
          onChange={(e) => setName(e.target.value)} onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') { saveName(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') setName(d.name); }} />
        <span className="tset-label">Норма</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="tseg" role="radiogroup" aria-label="Норма">
            {NORM_OPTS.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={o.value === d.norm_type} onClick={() => setNormType(o.value)}>{o.label}</button>
            ))}
          </div>
          {d.norm_type !== 'none' && (
            <input className="tset-input norm" value={norm} aria-label={d.norm_type === 'daily' ? 'Часов в рабочий день' : 'Часов в месяц'}
              inputMode="numeric" onChange={(e) => setNorm(e.target.value)} onBlur={saveNorm}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          )}
        </div>
        <span className="tset-label">Область задач</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Select label="Область задач" value={d.area_id ?? ''} minWidth={180}
            onChange={(v) => store.patch('time_directions', d.id, { area_id: v || null })}
            options={[{ value: '', label: 'не указана' }, ...areas.map((a) => ({ value: a.id, label: a.name || 'Без названия' }))]} />
          <span className="tset-note">необязательно</span>
        </div>
      </div>
      <div className="tset-projects">
        <span className="tset-projects-title">
          {area ? `На шаге «Проект» появятся проекты области «${area.name}»:` : 'На шаге «Проект» — все активные проекты задач, по областям'}
        </span>
        {area && projects.length > 0 && (
          <div className="tset-chips">
            {projects.map((p) => (
              <span key={p.id} className="tset-chip">
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#3D6A00" strokeWidth="2.5" /></svg>
                {p.name || 'Новый проект'}
              </span>
            ))}
          </div>
        )}
        <span className="tset-note dark">
          {area ? (projects.length ? 'Только активные. Проекты создаются как обычно — «+ Новый список» в меню задач.'
            : 'В этой области пока нет открытых проектов. Проекты создаются как обычно — «+ Новый список» в меню задач.')
            : 'Укажи область — и здесь будут только её проекты.'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="tset-label">Этапы <span style={{ fontWeight: 600, color: '#8E9289' }}>· у любого проекта, отмеченного под {d.name ? `«${d.name}»` : 'этим направлением'}</span></span>
        {(stages.length > 0 || addingStage) && (
          <div className="tset-stages">
            {stages.map((s, i) => <StageRow key={s.id} s={s} n={i + 1} onMenu={(a) => onStageMenu(s, a)} />)}
            {addingStage && (
              <NewStage n={stages.length + 1} onDone={(nm) => {
                if (nm) store.insert('time_stages', { direction_id: d.id, name: nm, sort_order: nextOrder(stages) });
                else setAddingStage(false);
              }} onCancel={() => setAddingStage(false)} />
            )}
          </div>
        )}
        {!addingStage && (
          <button type="button" className="tset-add-stage" onClick={() => setAddingStage(true)}>
            <Icon name="plus" size={14} color="#3E423C" width={2} />Этап
          </button>
        )}
      </div>
      {isNew && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="tset-lime" onClick={() => { saveName(); onDone(); }} disabled={!name.trim()}>Готово</button>
        </div>
      )}
    </div>
  );
}

function StageRow({ s, n, onMenu }: { s: TimeStage; n: number; onMenu: (a: Anchor) => void }) {
  const store = useStore();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === s.id) { setName(s.name); setEdit(true); } };
    window.addEventListener('tset-rename-stage', on);
    return () => window.removeEventListener('tset-rename-stage', on);
  }, [s.id, s.name]);
  const save = () => { setEdit(false); const nm = name.trim(); if (nm && nm !== s.name) store.patch('time_stages', s.id, { name: nm }); };
  return (
    <div className={'tset-stage' + (edit ? ' editing' : '')}>
      <span className="tset-stage-n">{n}</span>
      {edit ? (
        <input autoFocus className="tset-stage-input" value={name} aria-label="Название этапа" onChange={(e) => setName(e.target.value)}
          onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(s.name); setEdit(false); } }} />
      ) : (
        <span className="tset-stage-name" onDoubleClick={() => { setName(s.name); setEdit(true); }}>
          {s.name}{s.status === 'archived' && <span className="tset-tag">архив</span>}
        </span>
      )}
      {!edit && (
        <button type="button" className="tool" aria-label={`Действия с этапом «${s.name}»`} style={{ width: 26, height: 26 }}
          onClick={(e) => onMenu(e.currentTarget)}>
          <Icon name="more" size={16} color="#8E9289" width={3} />
        </button>
      )}
    </div>
  );
}

/** Новое поле в конце списка этапов: Enter — добавить и сразу следующее, пусто + Enter или Esc — закрыть. */
function NewStage({ n, onDone, onCancel }: { n: number; onDone: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="tset-stage editing new">
      <span className="tset-stage-n">{n}</span>
      <input ref={ref} autoFocus className="tset-stage-input" value={name} placeholder="Название этапа" aria-label="Новый этап"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name.trim()) onDone(name.trim()); onCancel(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onDone(name.trim()); setName(''); }
          if (e.key === 'Escape') onCancel();
        }} />
    </div>
  );
}

/** Удаление того, на что отмечено время: предлагаем «В архив» (часы остаются в отчётах). */
function ArchiveDialog({ del, onClose }: { del: Deleting; onClose: () => void }) {
  const store = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const what = del.kind === 'category' ? 'категорию' : del.kind === 'direction' ? 'направление' : 'этап';
  const table = del.kind === 'category' ? 'time_categories' : del.kind === 'direction' ? 'time_directions' : 'time_stages';
  const run = () => {
    store.withUndo('Перенесено в архив', () => store.patch(table, del.id, { status: 'archived' } as never));
    onClose();
  };
  return createPortal(
    <div className="modal-scrim" data-keep-card onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="del-time" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2 id="del-time">Удалить {what} «{del.name}»?</h2>
        <p>На {del.kind === 'category' ? 'неё' : 'него'} уже отмечено {fmtHM(del.minutes)}. Удалить совсем нельзя — эти часы пропали бы из отчётов.
          Можно убрать в архив: при отметке {del.kind === 'category' ? 'она' : 'он'} больше не предлагается, а в отчётах и отмеченных слотах всё остаётся.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-text" style={{ padding: '0 12px' }} onClick={onClose}>Отменить</button>
          <button type="button" className="btn-lime" style={{ padding: '0 18px', height: 40 }} onClick={run}>В архив</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
