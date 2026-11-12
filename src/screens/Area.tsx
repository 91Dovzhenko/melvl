import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore, useToday } from '../lib/store';
import { planSums, projectProgress } from '../lib/views';
import { addDays, fmtMin } from '../lib/dates';
import { PlanSumBlock } from '../ui/Sums';
import { useNewTaskContext } from '../tasks/editing';
import { Icon, Ring } from '../ui/icons';
import { EditableTitle, MoreMenu } from './parts';
import { useIsPhone } from '../ui/useIsPhone';
import { goTo } from '../lib/navBridge';

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

  const today = useToday();
  const tomorrow = addDays(today, 1);
  // Часы области — по задачам её проектов и задачам, лежащим прямо в области.
  const projectIds = new Set(projects.map((p) => p.id));
  const sums = planSums(store.tasks.filter((t) => (t.project_id && projectIds.has(t.project_id)) || (!t.project_id && t.area_id === id)), today, tomorrow);

  if (!a) return (store.loading ? <div className="hint-center" /> : <Navigate to="/today" replace />);
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
                const aid = a.id;
                store.withUndo('Область удалена', () => {
                  for (const p of store.projects.filter((x) => x.area_id === a.id)) store.patch('projects', p.id, { area_id: null });
                  for (const t of store.tasks.filter((x) => x.area_id === a.id)) store.patch('tasks', t.id, { area_id: null });
                  store.remove('areas', a.id);
                }, () => goTo(`/area/${aid}`));
                nav('/today');
              },
            },
          ]} />
        </div>
        <div style={phone ? { flexBasis: '100%' } : { flexShrink: 0 }}>
          <PlanSumBlock {...sums} />
        </div>
      </header>

      <section aria-label="Проекты области" style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 7px', margin: '0 -8px 4px', borderBottom: '1px solid #ECEEE8', fontSize: 12, fontWeight: 700, color: '#5F635C' }}>
          <span style={{ flex: 1 }}>Проекты</span>
          <span style={{ width: 64, textAlign: 'right' }}>сегодня</span>
          <span style={{ width: 64, textAlign: 'right' }}>всего</span>
        </div>
        {projects.map((p) => {
          const open = store.tasks.filter((t) => t.project_id === p.id && t.status === 'open' && !t.deleted_at && !t.is_template).length;
          const s = planSums(store.tasks.filter((t) => t.project_id === p.id), today, tomorrow);
          return (
            <Link key={p.id} to={`/project/${p.id}`} className="prow">
              <Ring size={18} progress={projectProgress(store, p.id)} done={p.status === 'completed'} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="name" title={p.name}>{p.name || 'Новый проект'}</span>
                <span className="count-chip" title="Открытых задач">{open}</span>
                {p.notes.trim() && <Icon name="note" size={13} color="#8E9289" width={1.9} />}
              </span>
              <span style={{ width: 64, textAlign: 'right', fontSize: 14, fontWeight: s.today ? 800 : 600, color: s.today ? '#15171A' : '#8E9289' }}>
                {s.today ? fmtMin(s.today) : '—'}
              </span>
              <span style={{ width: 64, textAlign: 'right', fontSize: 14, fontWeight: 800 }}>{fmtMin(s.total)}</span>
            </Link>
          );
        })}
        {projects.length === 0 && <p className="foot-note">В области пока нет проектов. «+» внизу — новый проект.</p>}
      </section>
      <p className="foot-note" style={{ fontSize: 12 }}>
        «Позже» — все задачи после завтра и без даты. «Когда-нибудь» и задачи без оценки в суммы не входят.
        {sums.noEstimate > 0 && ` Без оценки: ${sums.noEstimate} ${plural(sums.noEstimate, 'задача', 'задачи', 'задач')}.`}
      </p>
    </>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
