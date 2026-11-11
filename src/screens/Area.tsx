import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { projectProgress } from '../lib/views';
import { useNewTaskContext } from '../tasks/editing';
import { Icon, Ring } from '../ui/icons';
import { EditableTitle, MoreMenu } from './parts';
import { useIsPhone } from '../ui/useIsPhone';

export function AreaScreen() {
  const { id = '' } = useParams();
  const store = useStore();
  const nav = useNavigate();
  const phone = useIsPhone();
  const loc = useLocation();
  const [renameSignal, setRenameSignal] = useState(0);
  const a = store.areas.find((x) => x.id === id);
  const projects = store.projects
    .filter((p) => p.area_id === id && !p.logged_at && p.status !== 'canceled')
    .sort((x, y) => x.sort_order - y.sort_order);

  // В области «+» создаёт проект в этой области (как на макете «Область»).
  useNewTaskContext({
    defaults: { area_id: id }, list: [],
    onNew: () => {
      const p = store.insert('projects', { area_id: id, sort_order: (projects.at(-1)?.sort_order ?? 0) + 1 });
      nav(`/project/${p.id}`, { state: { rename: true } });
    },
  });

  if (!a) return <div className="hint-center">{store.loading ? '' : 'Область не найдена'}</div>;
  const isNew = (loc.state as { rename?: boolean } | null)?.rename;

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-start', columnGap: 12, flexWrap: 'wrap' }}>
        <Icon name="area" size={28} color="#3D6A00" style={{ marginTop: 3 }} />
        <div style={{ flex: phone ? '1 1 0' : '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <EditableTitle value={a.name} placeholder="Новая область" autoFocus={isNew} focusSignal={renameSignal}
            onSave={(name) => store.patch('areas', a.id, { name })} />
          <MoreMenu label="Действия с областью" items={[
            { label: 'Переименовать', icon: 'pencil', onClick: () => setRenameSignal((n) => n + 1) },
            {
              label: 'Удалить область', icon: 'trash', onClick: () => {
                // Проекты и задачи области остаются, но без области.
                store.withUndo('Область удалена', () => {
                  for (const p of store.projects.filter((x) => x.area_id === a.id)) store.patch('projects', p.id, { area_id: null });
                  for (const t of store.tasks.filter((x) => x.area_id === a.id)) store.patch('tasks', t.id, { area_id: null });
                  store.remove('areas', a.id);
                });
                nav('/today');
              },
            },
          ]} />
        </div>
      </header>

      <section aria-label="Проекты области" style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 7px', margin: '0 -8px 4px', borderBottom: '1px solid #ECEEE8', fontSize: 12, fontWeight: 700, color: '#5F635C' }}>
          <span style={{ flex: 1 }}>Проекты</span>
        </div>
        {projects.map((p) => {
          const open = store.tasks.filter((t) => t.project_id === p.id && t.status === 'open' && !t.deleted_at).length;
          return (
            <Link key={p.id} to={`/project/${p.id}`} className="prow">
              <Ring size={18} progress={projectProgress(store, p.id)} done={p.status === 'completed'} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="name" title={p.name}>{p.name || 'Новый проект'}</span>
                <span className="count-chip" title="Открытых задач">{open}</span>
                {p.notes.trim() && <Icon name="note" size={13} color="#8E9289" width={1.9} />}
              </span>
            </Link>
          );
        })}
        {projects.length === 0 && <p className="foot-note">В области пока нет проектов. «Новый список» → «Новый проект».</p>}
      </section>
    </>
  );
}
