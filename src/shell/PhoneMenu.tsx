import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Ring } from '../ui/icons';
import { useStore, useToday } from '../lib/store';
import { counts, projectProgress, sortedAreas } from '../lib/views';
import type { Project } from '../lib/types';
import { FUTURE, menuProjects, SECTIONS, SettingsPopover } from './Sidebar';

/** iPhone · Меню — отдельный экран. */
export function PhoneMenu({ email }: { email: string }) {
  const store = useStore();
  const today = useToday();
  const c = counts(store, today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const projects = menuProjects(store.projects);
  const loose = projects.filter((p) => !p.area_id);

  return (
    <nav className="phone-menu" aria-label="Разделы">
      <div className="phone-logo" style={{ position: 'relative' }}>
        <span className="logo-mark"><span /></span>
        <span className="logo-text">ME:LVL</span>
        <button type="button" className="icon-btn44" aria-label="Настройки" aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}>
          <Icon name="settings" size={22} color="#3E423C" />
        </button>
        {settingsOpen && <SettingsPopover email={email} onClose={() => setSettingsOpen(false)} style={{ top: 48, right: 0 }} />}
      </div>

      <div className="phone-card">
        {SECTIONS.map((s) => {
          const n = s.count ? c[s.count] : 0;
          return (
            <Link key={s.path} to={s.path} className="phone-row">
              <Icon name={s.icon} size={22} />
              <span className="label">{s.label}</span>
              <span className="count">{n > 0 ? n : ''}</span>
            </Link>
          );
        })}
      </div>

      <div className="phone-card">
        {FUTURE.map((f) => (
          <div key={f.label} className="phone-row future" aria-disabled="true">
            <Icon name={f.icon} size={22} color="#8E9289" />
            <span className="label">{f.label}</span>
            <span className="soon">скоро</span>
          </div>
        ))}
      </div>

      {loose.length > 0 && (
        <div className="phone-card">
          {loose.map((p) => <PhoneProject key={p.id} p={p} />)}
        </div>
      )}

      {sortedAreas(store).map((a) => {
        const open = !collapsed[a.id];
        return (
          <div className="phone-card" key={a.id}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Link to={`/area/${a.id}`} className="phone-row area" style={{ flex: 1 }}>
                <Icon name="area" size={22} color="#5F635C" />
                <span className="label">{a.name || 'Новая область'}</span>
              </Link>
              <button type="button" className="icon-btn44" aria-expanded={open} aria-label={open ? 'Свернуть' : 'Развернуть'}
                onClick={() => setCollapsed((m) => ({ ...m, [a.id]: open }))} style={{ marginRight: 4 }}>
                <Icon name="chevronDown" size={18} color="#8E9289" width={2}
                  style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform .15s' }} />
              </button>
            </div>
            {open && projects.filter((p) => p.area_id === a.id).map((p) => <PhoneProject key={p.id} p={p} />)}
          </div>
        );
      })}
    </nav>
  );
}

function PhoneProject({ p }: { p: Project }) {
  const store = useStore();
  return (
    <Link to={`/project/${p.id}`} className="phone-row project">
      <Ring size={22} progress={projectProgress(store, p.id)} done={p.status === 'completed'} />
      <span className="label">{p.name || 'Новый проект'}</span>
      {p.is_quest && <Icon name="quest" size={14} color="#3D6A00" width={2.2} />}
    </Link>
  );
}
