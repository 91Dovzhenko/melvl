// «Проекты» (21_ТЗ, 4.4 и 5.4; спецификация «Время», раздел 9): сравнение проектов задач направления по этапам.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Icon } from '../../ui/icons';
import { Pop, type Anchor } from '../../ui/Pop';
import { useIsPhone } from '../../ui/useIsPhone';
import { fmtHM } from '../../lib/time/format';
import { colorHex } from '../../lib/time/palette';
import { MAX_PROJECT_COLUMNS, compareRows, directionProjects, pickColumns, togglePick, type ProjectLite } from '../../lib/time/projects';
import { SLOT_MIN, type TimeDirection } from '../../lib/time/types';

const DIR_STORE = 'melvl.time.projectsDir';
const byOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;
const readDir = () => { try { return localStorage.getItem(DIR_STORE); } catch { return null; } };
const saveDir = (id: string) => { try { localStorage.setItem(DIR_STORE, id); } catch { /* приватный режим */ } };

export function ProjectsView() {
  const store = useStore();
  const phone = useIsPhone();
  const nav = useNavigate();
  const cats = store.time_categories.filter((c) => !c.deleted_at).sort(byOrder);
  const dirs = cats.flatMap((c) => store.time_directions.filter((d) => d.category_id === c.id && !d.deleted_at).sort(byOrder));
  const allProjects = useMemo<ProjectLite[]>(() => [...store.projects, ...store.timeProjects], [store.projects, store.timeProjects]);
  const withTime = (d: TimeDirection) => store.time_slots.some((s) => s.direction_id === d.id && s.project_id);
  // По умолчанию: последнее выбранное на устройстве, иначе первое направление, где есть время по проектам.
  const [dirId, setDirId] = useState<string | null>(() => {
    const saved = readDir();
    if (saved && dirs.some((d) => d.id === saved)) return saved;
    return (dirs.find(withTime) ?? dirs[0])?.id ?? null;
  });
  const [dirMenu, setDirMenu] = useState<Anchor | null>(null);
  const [pickMenu, setPickMenu] = useState<Anchor | null>(null);
  // Данные могли прийти позже первого показа — тогда берём направление по умолчанию сейчас.
  const dir = dirs.find((d) => d.id === dirId) ?? dirs.find(withTime) ?? dirs[0] ?? null;
  const cat = dir ? cats.find((c) => c.id === dir.category_id) ?? null : null;

  const available = useMemo(() => (dir ? directionProjects(store.time_slots, dir.id, allProjects) : []), [dir, store.time_slots, allProjects]);
  const savedPick = dir ? store.settings.time_projects_pick?.[dir.id] ?? null : null;
  const columns = pickColumns(available, savedPick);
  const rows = dir ? compareRows(store.time_slots, dir.id, columns, store.time_stages) : [];
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    if (dir) for (const s of store.time_slots) if (s.direction_id === dir.id && s.project_id) m.set(s.project_id, (m.get(s.project_id) ?? 0) + SLOT_MIN);
    return m;
  }, [dir, store.time_slots]);

  const setPick = (ids: string[]) => {
    if (!dir) return;
    store.patchSettings({ time_projects_pick: { ...(store.settings.time_projects_pick ?? {}), [dir.id]: ids } });
  };

  if (!dir) {
    return (
      <div className="tset-empty">
        <span style={{ fontSize: 16, fontWeight: 800 }}>Направлений пока нет</span>
        <span className="set-sub">Проекты сравниваются внутри направления — заведи его в Настройках → «Учёт времени».</span>
      </div>
    );
  }

  const pickedIds = columns.map((p) => p.id);
  const single = columns.length === 1;
  return (
    <>
      <div className="day-bar">
        <button type="button" className={'tsum-picker' + (dirMenu ? ' open' : '')} aria-haspopup="menu" aria-expanded={!!dirMenu}
          onClick={(e) => setDirMenu(dirMenu ? null : e.currentTarget)}>
          <span className="tset-dot" style={{ background: colorHex(cat?.color) }} />
          {cat?.name} · {dir.name}
          <Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
        </button>
      </div>
      {dirMenu && (
        <Pop anchor={dirMenu} onClose={() => setDirMenu(null)} variant="light" width={280} title="Направление">
          {cats.map((c) => {
            const own = dirs.filter((d) => d.category_id === c.id);
            if (!own.length) return null;
            return (
              <div key={c.id} style={{ display: 'contents' }}>
                <span className="tsum-menu-head"><span className="tset-dot" style={{ width: 8, height: 8, background: colorHex(c.color) }} />{c.name.toUpperCase()}</span>
                {own.map((d) => (
                  <button key={d.id} type="button" className={'pop-item' + (d.id === dir.id ? ' selected' : '')} style={{ paddingLeft: 22 }}
                    onClick={() => { setDirId(d.id); saveDir(d.id); setDirMenu(null); }}>
                    <span className="pop-label">{d.name}</span>
                    {!withTime(d) && <span className="pop-hint">нет времени</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </Pop>
      )}

      {available.length === 0 ? (
        <div className="tset-empty">
          <span style={{ fontSize: 16, fontWeight: 800 }}>Под «{dir.name}» ещё нет времени по проектам</span>
          <span className="set-sub" style={{ maxWidth: 460, lineHeight: 1.5 }}>
            Отметь слоты в «Дне» до проекта: {cat?.name} › {dir.name} › проект › этап. Проекты — твои проекты задач
            {dir.area_id ? ` из области «${store.areas.find((a) => a.id === dir.area_id)?.name ?? ''}»` : ''}. Здесь они встанут рядом по этапам.
          </span>
          <button type="button" className="tset-lime" onClick={() => nav('/time/day')}>Открыть «День»</button>
        </div>
      ) : (
        <div className="tproj">
          <div className="tproj-bar">
            <span className="tproj-h">{phone ? 'По этапам' : 'Сравнение по этапам'}</span>
            {available.length > 1 && (
              <button type="button" className={'tsum-picker' + (pickMenu ? ' open' : '')} style={{ marginLeft: 'auto', marginRight: 0, height: 32, fontSize: 13 }}
                aria-haspopup="menu" aria-expanded={!!pickMenu} onClick={(e) => setPickMenu(pickMenu ? null : e.currentTarget)}>
                Проекты · {columns.length}<Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
              </button>
            )}
          </div>
          {pickMenu && (
            <Pop anchor={pickMenu} onClose={() => setPickMenu(null)} variant="light" width={300} title="Какие проекты сравнивать" align="right">
              <span className="tsum-menu-head" style={{ padding: '6px 10px 4px' }}>ОТ НОВЫХ К СТАРЫМ · НЕ БОЛЬШЕ {MAX_PROJECT_COLUMNS}</span>
              {available.map((p) => {
                const on = pickedIds.includes(p.id);
                const dis = !on && pickedIds.length >= MAX_PROJECT_COLUMNS;
                return (
                  <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={on} aria-disabled={dis} disabled={dis}
                    className="tsum-check" style={{ paddingLeft: 10, opacity: dis ? 0.4 : 1 }}
                    onClick={() => { const next = togglePick(pickedIds, p.id); if (next.length) setPick(next); }}>
                    <span className={'box' + (on ? ' on' : '')}>{on && <Icon name="check" size={10} width={3} />}</span>
                    <span className="nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || 'Новый проект'}</span>
                    {projTag(p) && <span className="tproj-tag">{projTag(p)}</span>}
                    <span className="nt" style={{ fontWeight: 700, color: '#5F635C' }}>{fmtHM(totals.get(p.id) ?? 0)}</span>
                  </button>
                );
              })}
              {pickedIds.length >= MAX_PROJECT_COLUMNS && <span className="tproj-pick-note">Выбрано {MAX_PROJECT_COLUMNS} — сними галочку, чтобы взять другой.</span>}
            </Pop>
          )}

          <div className={'tproj-scroll' + (phone ? ' ph' : '')}>
            <div className="tproj-table" role="table" style={{
              gridTemplateColumns: phone ? `128px repeat(${columns.length}, 104px)` : single ? '220px 200px 1fr' : `200px repeat(${columns.length}, minmax(0, 1fr))`,
            }}>
              <span role="columnheader" className="tproj-headcell first">Этап</span>
              {columns.map((p) => <ProjectHead key={p.id} p={p} />)}
              {single && !phone && <span className="tproj-headcell" />}
              {rows.map((r, ri) => (
                <div key={r.key} role="row" style={{ display: 'contents' }}>
                  <span role="rowheader" className={'tproj-cell first ' + r.kind + (ri === 1 ? ' after' : '')}>{r.label}{r.archived && <span className="tproj-tag" style={{ marginLeft: 8 }}>архив</span>}</span>
                  {r.values.map((v, i) => (
                    <span key={i} role="cell" className={'tproj-cell ' + r.kind + (ri === 1 ? ' after' : '')}>
                      <span className={(v ? '' : 'dash') + (r.max.includes(i) ? ' max' : '')}>{v ? fmtHM(v) : '—'}</span>
                    </span>
                  ))}
                  {single && !phone && <span className={'tproj-cell ' + r.kind + (ri === 1 ? ' after' : '')} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const projTag = (p: ProjectLite) => (p.deleted_at ? 'удалён' : p.status === 'completed' ? 'завершён' : p.status === 'canceled' ? 'отменён' : '');

/** Название — до двух строк, длиннее — многоточие и подсказка с полным названием; метка «завершён» — под ним. */
function ProjectHead({ p }: { p: ProjectLite }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => { const el = ref.current; if (el) setCut(el.scrollHeight > el.clientHeight + 1); }, [p.name]);
  const tag = projTag(p);
  return (
    <span role="columnheader" className={'tproj-headcell' + (cut ? ' cut' : '')} tabIndex={cut ? 0 : undefined} aria-label={p.name}>
      <span ref={ref} className="nm">{p.name || 'Новый проект'}</span>
      {tag && <span className="tproj-tag">{tag}</span>}
      {cut && <span role="tooltip" className="tproj-tip">{p.name}</span>}
    </span>
  );
}
