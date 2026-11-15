import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, Ring, type IconName } from '../ui/icons';
import { useStore, useToday } from '../lib/store';
import { counts, projectProgress, sortedAreas } from '../lib/views';
import type { Area, Project, Task } from '../lib/types';
import { navDropChanges, placeAt, type NavTarget } from '../lib/reorder';
import { useDnd, useDndList, useDragSource } from '../tasks/dnd';
import { badgeOn } from '../lib/growth/growth';

export const SECTIONS: { path: string; label: string; icon: IconName; count?: 'inbox' | 'today' }[] = [
  { path: '/inbox', label: 'Входящие', icon: 'inbox', count: 'inbox' },
  { path: '/today', label: 'Сегодня', icon: 'today', count: 'today' },
  { path: '/plans', label: 'Планы', icon: 'plans' },
  { path: '/log', label: 'Журнал', icon: 'log' },
];

/** Разделы роста: «Персонаж» (точка-бейдж) и «Цели»; «Время» — скоро. */
export const GROWTH: { path: string; label: string; icon: IconName; dot?: boolean }[] = [
  { path: '/character', label: 'Персонаж', icon: 'character', dot: true },
  { path: '/goals', label: 'Цели', icon: 'goal' },
];
export const FUTURE: { label: string; icon: IconName }[] = [
  { label: 'Время', icon: 'time' },
];

/** Точка-бейдж на «Персонаже»: вырос уровень после последнего открытия раздела. */
export function useCharacterDot() {
  const store = useStore();
  const { tasks, projects, skills, settings } = store;
  return useMemo(() => badgeOn({ tasks, projects, skills }, settings.character_seen_at),
    [tasks, projects, skills, settings.character_seen_at]);
}

/** Проекты, видимые в меню: открытые и завершённые до переноса в Журнал. */
export const menuProjects = (projects: Project[]) =>
  projects.filter((p) => !p.logged_at && p.status !== 'canceled').sort((a, b) => a.sort_order - b.sort_order);

/** Создание проекта / области. Новый проект — в текущей области (если открыта область или её проект). */
export function useCreateList() {
  const store = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const currentArea = () => {
    const m = loc.pathname.match(/^\/(area|project)\/([^/]+)/);
    if (!m) return null;
    if (m[1] === 'area') return m[2];
    return store.projects.find((p) => p.id === m[2])?.area_id ?? null;
  };
  return {
    project: () => {
      const area = currentArea();
      const siblings = store.projects.filter((p) => p.area_id === area);
      const p = store.insert('projects', { area_id: area, sort_order: Math.max(0, ...siblings.map((s) => s.sort_order)) + 1 });
      nav(`/project/${p.id}`, { state: { rename: true } });
    },
    area: () => {
      const a = store.insert('areas', { sort_order: Math.max(0, ...store.areas.map((s) => s.sort_order)) + 1 });
      nav(`/area/${a.id}`, { state: { rename: true } });
    },
  };
}

export function Sidebar() {
  const store = useStore();
  const today = useToday();
  const c = counts(store, today);
  const create = useCreateList();
  const [menu, setMenu] = useState<'new' | null>(null);
  const projects = menuProjects(store.projects);
  const loose = projects.filter((p) => !p.area_id);
  const dot = useCharacterDot();
  const dnd = useDnd();
  const navTarget = dnd?.view?.nav ?? null;
  const dropNav = useTaskNavDrop();
  useEffect(() => { dnd?.setNav(dropNav); });
  const areas = sortedAreas(store);
  const areaList = useDndList('nav:areas', {
    kind: 'area', ids: areas.map((a) => a.id),
    resolve: (_i, desired) => ({ index: desired, valid: true }),
    drop: (item, index, others) => {
      const order = others.map((id) => ({ id, order: store.areas.find((a) => a.id === id)?.sort_order ?? 0 }));
      const cur = store.areas.find((a) => a.id === item.id)?.sort_order ?? 0;
      store.withUndo('Порядок областей изменён', () => {
        for (const c of placeAt(order, index, item.id, cur)) store.patch('areas', c.id, { sort_order: c.order });
      }, undefined, true);
    },
  });
  const shownAreas = areaList.hidden ? areas.filter((a) => a.id !== areaList.hidden) : areas;
  const navCls = (key: string | null) => (key && navTarget === key ? ' drop-target' : '');

  return (
    <nav className="sidebar" aria-label="Разделы">
      <div className="logo">
        <span className="logo-mark"><span /></span>
        <span className="logo-text">ME:LVL</span>
      </div>

      <div className="nav-group">
        {SECTIONS.map((s) => {
          const n = s.count ? c[s.count] : 0;
          return (
            <NavLink key={s.path} to={s.path} draggable={false} data-drop-nav={NAV_KEY[s.path]}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '') + navCls(NAV_KEY[s.path] ?? null)}>
              <Icon name={s.icon} size={18} />
              <span className="label">{s.label}</span>
              <span className="count">{n > 0 ? n : ''}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="nav-group">
        {GROWTH.map((g) => (
          <NavLink key={g.path} to={g.path} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Icon name={g.icon} size={18} />
            <span className="label">{g.label}</span>
            {g.dot && dot && <span className="badge-dot" role="img" aria-label="Новый уровень" />}
          </NavLink>
        ))}
        {FUTURE.map((f) => (
          <button key={f.label} type="button" className="nav-item future" disabled aria-disabled="true">
            <Icon name={f.icon} size={18} color="#8E9289" />
            <span className="label">{f.label}</span>
            <span className="soon">скоро</span>
          </button>
        ))}
      </div>

      <div className="nav-areas" ref={areaList.ref as React.RefObject<HTMLDivElement>} data-dnd-list="nav:areas">
        {loose.length > 0 && <ProjectGroup area={null} projects={loose} navCls={navCls} />}
        {shownAreas.map((a, i) => (
          <Fragment key={a.id}>
            {areaList.slot === i && <div className="nav-slot" data-dnd-slot aria-hidden="true" />}
            <ProjectGroup area={a} projects={projects.filter((p) => p.area_id === a.id)} navCls={navCls} />
          </Fragment>
        ))}
        {areaList.slot !== null && areaList.slot >= shownAreas.length && <div className="nav-slot" data-dnd-slot aria-hidden="true" />}
        {!store.loading && store.areas.length === 0 && loose.length === 0 && (
          <div className="nav-empty">Областей и проектов пока нет — «Новый список» внизу</div>
        )}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="foot-btn grow" aria-expanded={menu === 'new'} onClick={() => setMenu(menu === 'new' ? null : 'new')}>
          <Icon name="plus" size={16} color="#3E423C" width={2} />
          Новый список
        </button>
        {/* Шестерёнка открывает «Настройки» в рабочей панели; активна — лайм. */}
        <NavLink to="/settings" className={({ isActive }) => 'foot-btn square' + (isActive ? ' active' : '')} aria-label="Настройки" title="Настройки">
          <Icon name="settings" size={16} color="#3E423C" />
        </NavLink>
        {menu === 'new' && (
          <Popover onClose={() => setMenu(null)} style={{ bottom: 40, left: 0 }}>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); create.project(); }}>
              <Ring size={16} progress={0} />Новый проект
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); create.area(); }}>
              <Icon name="area" size={16} color="#5F635C" />Новая область
            </button>
          </Popover>
        )}
      </div>
    </nav>
  );
}

const NAV_KEY: Record<string, string> = { '/inbox': 'inbox', '/today': 'today' };

/**
 * Группа меню: шапка области и её проекты (или проекты без области). Список для перетаскивания проектов (19_ТЗ):
 * порядок внутри области и перенос в другую область; шапку области можно тянуть — порядок областей.
 */
function ProjectGroup({ area, projects, navCls }: { area: Area | null; projects: Project[]; navCls: (key: string | null) => string }) {
  const store = useStore();
  const listId = 'nav:' + (area?.id ?? 'loose');
  const list = useDndList(listId, {
    kind: 'project', ids: projects.map((p) => p.id),
    resolve: (_i, desired) => ({ index: desired, valid: true }),
    drop: (item, index, others) => {
      const p = store.projects.find((x) => x.id === item.id);
      if (!p) return;
      const order = others.map((id) => ({ id, order: store.projects.find((x) => x.id === id)?.sort_order ?? 0 }));
      const moved = (p.area_id ?? null) !== (area?.id ?? null);
      store.withUndo(moved ? 'Проект перенесён' : 'Порядок проектов изменён', () => {
        for (const c of placeAt(order, index, p.id, p.sort_order)) {
          store.patch('projects', c.id, c.id === p.id && moved ? { sort_order: c.order, area_id: area?.id ?? null } : { sort_order: c.order });
        }
      }, undefined, !moved);
    },
  });
  const v = useDnd()?.view;
  // Проект тянут в другую область — шапка области-цели подсвечена (как цель в меню).
  const headTarget = !!v && v.item.kind === 'project' && v.over?.list === listId && v.origin.list !== listId && !v.faded;
  const startArea = useDragSource(area ? { kind: 'area', id: area.id } : null, 'nav:areas');
  const shown = list.hidden ? projects.filter((p) => p.id !== list.hidden) : projects;
  const items: React.ReactNode[] = [];
  shown.forEach((p, i) => {
    if (list.slot === i) items.push(<div key="slot" className="nav-slot" data-dnd-slot aria-hidden="true" />);
    items.push(<ProjectLink key={p.id} p={p} list={listId} navCls={navCls} />);
  });
  if (list.slot !== null && list.slot >= shown.length) items.push(<div key="slot" className="nav-slot" data-dnd-slot aria-hidden="true" />);
  return (
    <div className="nav-group" ref={list.ref as React.RefObject<HTMLDivElement>} data-dnd-list={listId} data-dnd-row={area?.id}>
      {area && (
        <NavLink to={`/area/${area.id}`} title={area.name} draggable={false} data-dnd-head data-drop-nav={'area:' + area.id}
          onPointerDown={startArea}
          className={({ isActive }) => 'nav-item area' + (isActive ? ' active' : '') + (headTarget ? ' drop-target' : navCls('area:' + area.id))}>
          <Icon name="area" size={16} color="#5F635C" />
          <span className="label">{area.name || 'Новая область'}</span>
        </NavLink>
      )}
      {items}
    </div>
  );
}

/** Задача, брошенная на пункт меню: «Входящие», «Сегодня», проект, область (19_ТЗ). */
function useTaskNavDrop() {
  const store = useStore();
  const today = useToday();
  const parse = (key: string): NavTarget | null => {
    if (key === 'inbox') return { kind: 'inbox' };
    if (key === 'today') return { kind: 'today' };
    const [k, id] = key.split(':');
    if (k === 'project' && id) return { kind: 'project', id };
    if (k === 'area' && id) return { kind: 'area', id };
    return null;
  };
  const changesFor = (taskId: string, key: string) => {
    const t = store.tasks.find((x) => x.id === taskId);
    const target = parse(key);
    if (!t || !target) return null;
    const ch = navDropChanges(t, target, today);
    return ch ? { t, target, ch } : null;
  };
  // Переехавшая задача встаёт в конец списка, куда её бросили.
  const maxOf = (list: Task[], key: 'sort_order' | 'today_order') => Math.max(0, ...list.map((x) => x[key])) + 1;
  return {
    accepts: (taskId: string, key: string) => !!changesFor(taskId, key),
    drop: (taskId: string, key: string) => {
      const r = changesFor(taskId, key);
      if (!r) return;
      const { t, target, ch } = r;
      const live = store.tasks.filter((x) => !x.deleted_at && x.id !== t.id);
      let order: Partial<Task> = {};
      let msg = 'Задача перемещена';
      if (target.kind === 'project') order = { sort_order: maxOf(live.filter((x) => x.project_id === target.id), 'sort_order') };
      if (target.kind === 'area') order = { sort_order: maxOf(live.filter((x) => !x.project_id && x.area_id === target.id), 'sort_order') };
      if (target.kind === 'inbox') { order = { sort_order: maxOf(live.filter((x) => !x.project_id && !x.area_id && !x.when_date && !x.someday), 'sort_order') }; msg = 'Задача — во Входящих'; }
      if (target.kind === 'today') { order = { today_order: maxOf(live.filter((x) => x.when_date === today), 'today_order') }; msg = 'Задача — на сегодня'; }
      store.withUndo(msg, () => store.patch('tasks', t.id, { ...ch, ...order }));
    },
  };
}

function ProjectLink({ p, list, navCls }: { p: Project; list: string; navCls: (key: string | null) => string }) {
  const store = useStore();
  const done = p.status === 'completed';
  const start = useDragSource({ kind: 'project', id: p.id }, list);
  return (
    <NavLink to={`/project/${p.id}`} title={p.name} draggable={false} data-dnd-row={p.id} data-drop-nav={'project:' + p.id}
      onPointerDown={start}
      className={({ isActive }) => 'nav-item project' + (isActive ? ' active' : '') + navCls('project:' + p.id)}
      style={done ? { color: '#3D6A00' } : undefined}>
      <Ring progress={projectProgress(store, p.id)} done={done} />
      <span className="label" style={done ? { fontWeight: 700 } : undefined}>{p.name || 'Новый проект'}</span>
      {p.is_quest && <Icon name="quest" size={12} color="#3D6A00" width={2.2} />}
    </NavLink>
  );
}

export function Popover({ onClose, style, children }: { onClose: () => void; style: React.CSSProperties; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return <div className="popover" ref={ref} role="menu" style={style}>{children}</div>;
}
