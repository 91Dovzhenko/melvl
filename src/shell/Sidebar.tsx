import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, Ring, type IconName } from '../ui/icons';
import { counts, projectProgress, type ShellData } from '../lib/data';
import { signOut } from '../lib/session';

export const SECTIONS: { path: string; label: string; icon: IconName; count?: 'inbox' | 'today' }[] = [
  { path: '/inbox', label: 'Входящие', icon: 'inbox', count: 'inbox' },
  { path: '/today', label: 'Сегодня', icon: 'today', count: 'today' },
  { path: '/plans', label: 'Планы', icon: 'plans' },
  { path: '/log', label: 'Журнал', icon: 'log' },
];

export const FUTURE: { label: string; icon: IconName }[] = [
  { label: 'Витрина', icon: 'showcase' },
  { label: 'Время', icon: 'time' },
];

export function Sidebar({ data, email }: { data: ShellData; email: string }) {
  const c = counts(data.tasks);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const loose = data.projects.filter((p) => !p.area_id);

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
            {loose.map((p) => <ProjectLink key={p.id} p={p} data={data} />)}
          </div>
        )}
        {data.areas.map((a) => (
          <div className="nav-group" key={a.id}>
            <NavLink to={`/area/${a.id}`} title={a.name} className={({ isActive }) => 'nav-item area' + (isActive ? ' active' : '')}>
              <Icon name="area" size={16} color="#5F635C" />
              <span className="label">{a.name || 'Новая область'}</span>
            </NavLink>
            {data.projects.filter((p) => p.area_id === a.id).map((p) => <ProjectLink key={p.id} p={p} data={data} />)}
          </div>
        ))}
        {!data.loading && data.areas.length === 0 && loose.length === 0 && (
          <div className="nav-empty">Областей и проектов пока нет</div>
        )}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="foot-btn grow" disabled title="Новый проект или область — этап 1">
          <Icon name="plus" size={16} color="#3E423C" width={2} />
          Новый список
        </button>
        <button type="button" className="foot-btn square" aria-label="Настройки" title="Настройки"
          aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
          <Icon name="settings" size={16} color="#3E423C" />
        </button>
        {settingsOpen && <SettingsPopover email={email} onClose={() => setSettingsOpen(false)} style={{ bottom: 40, right: 0 }} />}
      </div>
    </nav>
  );
}

function ProjectLink({ p, data }: { p: ShellData['projects'][number]; data: ShellData }) {
  const done = p.status === 'completed';
  return (
    <NavLink to={`/project/${p.id}`} title={p.name}
      className={({ isActive }) => 'nav-item project' + (isActive ? ' active' : '')}
      style={done ? { color: '#3D6A00' } : undefined}>
      <Ring progress={projectProgress(p.id, data.tasks)} done={done} />
      <span className="label" style={done ? { fontWeight: 700 } : undefined}>{p.name || 'Новый проект'}</span>
      {p.is_quest && <Icon name="quest" size={12} color="#3D6A00" width={2.2} />}
    </NavLink>
  );
}

export function SettingsPopover({ email, onClose, style }: { email: string; onClose: () => void; style: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="popover" ref={ref} role="menu" style={style}>
      <div className="meta" title={email}>{email}</div>
      <button type="button" role="menuitem" disabled>
        <Icon name="settings" size={17} color="#8E9289" />Настройки — этап 1
      </button>
      <button type="button" role="menuitem" onClick={() => { void signOut(); }}>
        <Icon name="logout" size={17} color="#3E423C" />Выйти
      </button>
    </div>
  );
}
