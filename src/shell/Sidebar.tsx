import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, Ring, type IconName } from '../ui/icons';
import { useStore, useToday } from '../lib/store';
import { counts, projectProgress, sortedAreas } from '../lib/views';
import type { Project } from '../lib/types';
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
            <NavLink key={s.path} to={s.path} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
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

      <div className="nav-areas">
        {loose.length > 0 && (
          <div className="nav-group">
            {loose.map((p) => <ProjectLink key={p.id} p={p} />)}
          </div>
        )}
        {sortedAreas(store).map((a) => (
          <div className="nav-group" key={a.id}>
            <NavLink to={`/area/${a.id}`} title={a.name} className={({ isActive }) => 'nav-item area' + (isActive ? ' active' : '')}>
              <Icon name="area" size={16} color="#5F635C" />
              <span className="label">{a.name || 'Новая область'}</span>
            </NavLink>
            {projects.filter((p) => p.area_id === a.id).map((p) => <ProjectLink key={p.id} p={p} />)}
          </div>
        ))}
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

function ProjectLink({ p }: { p: Project }) {
  const store = useStore();
  const done = p.status === 'completed';
  return (
    <NavLink to={`/project/${p.id}`} title={p.name}
      className={({ isActive }) => 'nav-item project' + (isActive ? ' active' : '')}
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
