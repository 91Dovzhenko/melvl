import { Link } from 'react-router-dom';
import { useStore, useToday } from '../lib/store';
import { isNewTask } from '../lib/newTasks';
import { isListed, isToday, projectProgress, todayGroups, todaySums } from '../lib/views';
import { TodaySumBlock } from '../ui/Sums';
import { TaskList } from '../tasks/TaskList';
import { useEditing, useNewTaskContext } from '../tasks/editing';
import { Icon, Ring } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';
import { BadgeHeader } from './parts';

export function Today() {
  const store = useStore();
  const today = useToday();
  const phone = useIsPhone();
  const ed = useEditing();
  // Вид хранится в настройках в базе (то же значение, что в Настройках → «Сегодня»): переживает перезапуск
  // и синхронизируется Mac ↔ iPhone (п. 8, 17_ТЗ).
  const flat = store.settings.today_view === 'list';
  const choose = (v: 'projects' | 'list') => { if (v !== store.settings.today_view) store.patchSettings({ today_view: v }); };
  const groups = todayGroups(store, today, flat);
  const list = store.tasks.filter((t) => isListed(t) && isToday(t, today));

  // В «Сегодня» новая задача — с датой сегодня; под выделенной — в её же группе.
  useNewTaskContext({
    defaults: { when_date: today },
    list,
    inheritFromSelected: ['project_id', 'area_id', 'when_evening'],
  });

  // Плашка «Новые задачи · N» (п. 9): задачи, пришедшие сами; «OK» гасит все точки разом.
  const newCount = list.filter((t) => isNewTask(t, today, store.settings.today_ack_at)).length;
  const ack = () => store.patchSettings({ today_ack_at: new Date().toISOString() });

  const hasDraftTop = !!ed.draft && ed.draft.afterId === null;
  const firstIsNone = groups[0]?.kind === 'none';

  return (
    <>
      <BadgeHeader icon="today" title="Сегодня" lime right={list.length > 0 ? <TodaySumBlock {...todaySums(list)} /> : undefined} />

      <div className="view-row">
        <div className="events-slot">
          <Icon name="when" size={16} color="#8E9289" />
          <span>События календаря — появятся на этапе 3</span>
        </div>
        <div className="seg" role="group" aria-label="Вид">
          <button type="button" aria-pressed={!flat} onClick={() => choose('projects')}>По проектам</button>
          <button type="button" aria-pressed={flat} onClick={() => choose('list')}>Списком</button>
        </div>
      </div>

      {newCount > 0 && (
        <div className={'new-banner' + (phone ? ' nb-phone' : '')} role="status">
          <span className="new-dot" aria-hidden="true" />
          <span className="new-banner-title">Новые задачи · {newCount}</span>
          {!phone && <span className="new-banner-hint">пришли сами: наступила дата или копия повтора</span>}
          <button type="button" className="new-banner-ok" onClick={ack}>OK</button>
        </div>
      )}

      {groups.length === 0 && !hasDraftTop ? (
        <div className="empty">
          <span className="empty-badge"><Icon name="today" size={30} color="#3D6A00" /></span>
          <span className="empty-title">На сегодня ничего нет</span>
          <span className="empty-hint">Перенесите задачи из Входящих или проектов либо нажмите {phone ? '«+»' : 'N'}, чтобы создать новую</span>
        </div>
      ) : (
        <div className="groups">
          {hasDraftTop && !firstIsNone && <TaskList tasks={[]} draftHere />}
          {groups.map((g, i) => (
            <section className="group" key={g.key}>
              {g.kind === 'project' && g.project && (
                <div className="group-head">
                  <Ring size={18} progress={projectProgress(store, g.project.id)} done={g.project.status === 'completed'} />
                  <h2><Link to={`/project/${g.project.id}`}>{g.project.name || 'Новый проект'}</Link></h2>
                  {g.project.is_quest && <span className="quest-tag"><Icon name="quest" size={12} color="#3D6A00" width={2.2} />квест</span>}
                </div>
              )}
              {g.kind === 'area' && g.area && (
                <div className="group-head">
                  <Icon name="area" size={18} color="#5F635C" />
                  <h2><Link to={`/area/${g.area.id}`}>{g.area.name || 'Новая область'}</Link></h2>
                </div>
              )}
              {g.kind === 'evening' && (
                <div className="group-head">
                  <Icon name="evening" size={18} width={1.9} />
                  <h2>Вечером</h2>
                </div>
              )}
              <TaskList tasks={g.tasks} draftHere={i === 0 && g.kind === 'none'}
                mode={{ showProject: flat || g.kind === 'evening', newDots: true }} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
