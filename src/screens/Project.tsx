import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { projectProgress, projectTasks } from '../lib/views';
import { TaskList } from '../tasks/TaskList';
import { useNewTaskContext } from '../tasks/editing';
import { Icon, Ring } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';
import { EditableNotes, EditableTitle, MoreMenu } from './parts';
import { EstimatePicker, SkillPicker } from '../tasks/pickers';
import { addDays, fmtMin } from '../lib/dates';
import { planSums } from '../lib/views';
import { PlanSumBlock } from '../ui/Sums';
import { useToday } from '../lib/store';

export function ProjectScreen() {
  const { id = '' } = useParams();
  const store = useStore();
  const today = useToday();
  const phone = useIsPhone();
  const nav = useNavigate();
  const loc = useLocation();
  const [renameSignal, setRenameSignal] = useState(0);
  const [showLogged, setShowLogged] = useState(false);
  const [pop, setPop] = useState<{ kind: 'skill' | 'quest'; anchor: HTMLElement } | null>(null);
  const p = store.projects.find((x) => x.id === id);
  const all = projectTasks(store, id);
  const visible = all.filter((t) => !t.logged_at);
  const logged = all.filter((t) => t.logged_at);

  // В проекте новая задача получает этот проект.
  useNewTaskContext({ defaults: { project_id: id }, list: visible });

  if (!p) {
    return (store.loading ? <div className="hint-center" /> : <Navigate to="/today" replace />);
  }

  const skill = store.skills.find((s) => s.id === p.default_skill_id);
  // Квест: сделано — сумма оценок выполненных задач проекта; план — оценка квеста.
  const questDone = all.filter((t) => t.status === 'completed').reduce((m, t) => m + (t.estimate_min ?? 0), 0);
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
            ...(p.is_quest ? [{ label: 'Не квест', icon: 'quest' as const, onClick: () => store.patch('projects', p.id, { is_quest: false }) }] : []),
            {
              label: 'Удалить проект', icon: 'trash', onClick: () => {
                store.withUndo('Проект удалён', () => {
                  for (const t of all) store.remove('tasks', t.id);
                  store.remove('projects', p.id);
                });
                nav('/today');
              },
            },
          ]} />
        </div>
        <PlanSumBlock {...planSums(all, today, addDays(today, 1))} />
      </header>

      <div className="props">
        <button type="button" className="pill" onClick={(e) => setPop({ kind: 'skill', anchor: e.currentTarget })}
          aria-label="Навык по умолчанию: изменить">
          <Icon name="skill" size={14} color="#3E423C" width={1.9} />
          <span>Навык по умолчанию</span><b>{skill?.name ?? 'не задан'}</b>
          <Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
        </button>
        {p.is_quest ? (
          <button type="button" className="pill" style={{ border: '1px solid #DCEFB0', background: '#F5FBE6', gap: 8 }}
            aria-label="Оценка квеста: изменить" onClick={(e) => setPop({ kind: 'quest', anchor: e.currentTarget })}>
            <Icon name="quest" size={13} color="#3D6A00" width={2.2} /><b style={{ color: '#3D6A00' }}>Квест</b>
            <b>{fmtMin(questDone)} <span style={{ fontWeight: 600, color: '#5F635C' }}>/ {p.quest_estimate_min ? fmtMin(p.quest_estimate_min) : '—'}</span></b>
            {!!p.quest_estimate_min && (
              <span style={{ width: 48, height: 4, borderRadius: 2, background: '#E3E5DF', overflow: 'hidden', display: 'block' }}>
                <span style={{ display: 'block', height: 4, borderRadius: 2, background: '#3D6A00', width: `${Math.min(100, Math.round(questDone / p.quest_estimate_min * 100))}%` }} />
              </span>
            )}
          </button>
        ) : (
          <button type="button" className="pill dashed" onClick={(e) => {
            store.patch('projects', p.id, { is_quest: true });
            setPop({ kind: 'quest', anchor: e.currentTarget });
          }}>
            <Icon name="quest" size={13} color="#8E9289" width={2.2} />Сделать квестом
          </button>
        )}
      </div>
      {pop?.kind === 'skill' && (
        <SkillPicker forProject anchor={pop.anchor} onClose={() => setPop(null)} value={p.default_skill_id}
          onPick={(id) => store.patch('projects', p.id, { default_skill_id: id })} />
      )}
      {pop?.kind === 'quest' && (
        <EstimatePicker anchor={pop.anchor} onClose={() => setPop(null)} value={p.quest_estimate_min}
          onPick={(v) => store.patch('projects', p.id, { quest_estimate_min: v })} />
      )}

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
