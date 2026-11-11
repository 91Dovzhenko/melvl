import { useStore, useToday } from '../lib/store';
import { addDays, fmtMin, parseISO } from '../lib/dates';
import { isListed } from '../lib/views';
import { TaskList } from '../tasks/TaskList';
import { useNewTaskContext } from '../tasks/editing';
import { Icon } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';
import { BadgeHeader } from './parts';

const WEEKDAY = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTH = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/**
 * Планы: задачи с датой после сегодня, по дням — любые, с проектом и без.
 * У дня — крупная дата, день недели, «запланировано» (сумма оценок задач дня), место под события (этап 3).
 */
export function Plans() {
  const store = useStore();
  const today = useToday();
  const phone = useIsPhone();
  const tomorrow = addDays(today, 1);
  const tasks = store.tasks
    .filter((t) => isListed(t) && !t.someday && t.when_date !== null && t.when_date > today)
    .sort((a, b) => (a.when_date! < b.when_date! ? -1 : a.when_date! > b.when_date! ? 1 : a.sort_order - b.sort_order));
  const days = [...new Set(tasks.map((t) => t.when_date!))];

  // Новая задача в Планах — на завтра; под выделенной — на её день (и в её проект).
  useNewTaskContext({ defaults: { when_date: tomorrow }, list: tasks, inheritFromSelected: ['when_date', 'project_id', 'area_id'] });

  return (
    <>
      <BadgeHeader icon="plans" title="Планы" lime />
      {days.length === 0 && (
        <>
          <TaskList tasks={[]} draftHere />
          <div className="empty">
            <span className="empty-badge"><Icon name="plans" size={30} color="#3D6A00" /></span>
            <span className="empty-title">Планов пока нет</span>
            <span className="empty-hint">Здесь будут задачи с датой после сегодня, по дням.</span>
          </div>
        </>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {days.map((d, i) => {
          const dt = parseISO(d);
          const list = tasks.filter((t) => t.when_date === d);
          const sum = list.reduce((m, t) => m + (t.estimate_min ?? 0), 0);
          const name = d === tomorrow ? 'Завтра' : WEEKDAY[dt.getDay()];
          const far = dt.getMonth() !== parseISO(today).getMonth();
          return (
            <section key={d} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="day-head">
                <span className="day-num">{dt.getDate()}</span>
                <span className="day-name">{name}{far ? `, ${MONTH[dt.getMonth()]}` : ''}</span>
                <span style={{ flex: 1 }} />
                <span className="day-sum"><span className="sum-cap">запланировано</span><b>{fmtMin(sum)}</b></span>
              </div>
              <div className="events-slot small">
                <Icon name="when" size={14} color="#8E9289" />
                <span>{phone ? 'События — этап 3' : 'События календаря — этап 3'}</span>
              </div>
              <TaskList tasks={list} mode={{ showProject: true }} draftHere={i === 0} />
            </section>
          );
        })}
      </div>
    </>
  );
}
