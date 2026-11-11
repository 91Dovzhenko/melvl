import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { projectProgress, projectTasks } from '../lib/views';
import { TaskList } from '../tasks/TaskList';
import { useNewTaskContext } from '../tasks/editing';
import { Icon, Ring } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';
import { EditableNotes, EditableTitle, MoreMenu } from './parts';

export function ProjectScreen() {
  const { id = '' } = useParams();
  const store = useStore();
  const phone = useIsPhone();
  const nav = useNavigate();
  const loc = useLocation();
  const [renameSignal, setRenameSignal] = useState(0);
  const [showLogged, setShowLogged] = useState(false);
  const p = store.projects.find((x) => x.id === id);
  const all = projectTasks(store, id);
  const visible = all.filter((t) => !t.logged_at);
  const logged = all.filter((t) => t.logged_at);

  // В проекте новая задача получает этот проект.
  useNewTaskContext({ defaults: { project_id: id }, list: visible });

  if (!p) {
    return <div className="hint-center">{store.loading ? '' : 'Проект не найден'}</div>;
  }

  const skill = store.skills.find((s) => s.id === p.default_skill_id);
  const isNew = (loc.state as { rename?: boolean } | null)?.rename;

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-start', columnGap: 12, rowGap: 14, flexWrap: 'wrap' }}>
        <button type="button" aria-label="Завершить проект — следующий пункт сборки" title="Завершить проект"
          disabled style={{ width: 32, height: 32, marginTop: 1, border: 0, background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ring size={28} progress={projectProgress(store, p.id)} done={p.status === 'completed'} />
        </button>
        <div style={{ flex: phone ? '1 1 0' : '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <EditableTitle value={p.name} placeholder="Новый проект" autoFocus={isNew} focusSignal={renameSignal}
            onSave={(name) => store.patch('projects', p.id, { name })} />
          <MoreMenu label="Действия с проектом" items={[
            { label: 'Переименовать', icon: 'pencil', onClick: () => setRenameSignal((n) => n + 1) },
            {
              label: 'Удалить проект', icon: 'trash', onClick: () => {
                if (!window.confirm(`Удалить проект «${p.name || 'Новый проект'}» вместе с задачами?`)) return;
                for (const t of all) store.remove('tasks', t.id);
                store.remove('projects', p.id);
                nav('/today');
              },
            },
          ]} />
        </div>
      </header>

      <div className="props">
        <button type="button" className="pill" disabled title="Выбор навыка — следующий пункт сборки">
          <Icon name="skill" size={14} color="#3E423C" width={1.9} />
          <span>Навык по умолчанию</span><b>{skill?.name ?? 'не задан'}</b>
        </button>
        {p.is_quest ? (
          <span className="pill" style={{ border: '1px solid #DCEFB0', background: '#F5FBE6' }}>
            <Icon name="quest" size={13} color="#3D6A00" width={2.2} /><b style={{ color: '#3D6A00' }}>Квест</b>
          </span>
        ) : (
          <button type="button" className="pill dashed" disabled title="Квест — следующие пункты сборки">
            <Icon name="quest" size={13} color="#8E9289" width={2.2} />Сделать квестом
          </button>
        )}
      </div>

      <EditableNotes value={p.notes} onSave={(notes) => store.patch('projects', p.id, { notes })} />

      <div style={{ paddingTop: 18, display: 'flex', flexDirection: 'column' }}>
        <TaskList tasks={showLogged ? [...visible, ...logged] : visible} mode={{ dueChips: true }} draftHere />
        {visible.length === 0 && !showLogged && <EmptyProjectHint phone={phone} />}
        {logged.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setShowLogged((v) => !v)}>
            {showLogged ? 'Скрыть выполненные' : `Показать выполненные · ${logged.length}`}
          </button>
        )}
      </div>
    </>
  );
}

function EmptyProjectHint({ phone }: { phone: boolean }) {
  return (
    <div className="hint-center" style={{ padding: '120px 0' }}>
      {phone
        ? <span>Нажмите «+», чтобы создать задачу</span>
        : <span>Нажмите <span className="kbd">N</span>, чтобы создать задачу</span>}
    </div>
  );
}
