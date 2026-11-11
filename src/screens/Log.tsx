import { Link } from 'react-router-dom';
import { useStore, useToday } from '../lib/store';
import { addDays, shortDate } from '../lib/dates';
import { doneDay, useLogbook } from '../lib/logbook';
import { TaskList } from '../tasks/TaskList';
import { useNewTaskContext } from '../tasks/editing';
import { Icon } from '../ui/icons';
import type { Project, Task } from '../lib/types';
import { BadgeHeader } from './parts';

type Entry = { day: string; task?: Task; project?: Project };

/**
 * Журнал: перенесённые выполненные задачи и завершённые проекты, группы по дню выполнения (новые сверху).
 * Оценка и навык — в строке всегда. Завершённый проект ведёт внутрь. Снять отметку — вернуть задачу в работу.
 */
export function Log() {
  const store = useStore();
  const today = useToday();
  const { logNow } = useLogbook();
  const yesterday = addDays(today, -1);
  useNewTaskContext({ defaults: {}, list: [], onNew: () => {} });

  const entries: Entry[] = [
    ...store.tasks.filter((t) => t.logged_at && t.status === 'completed' && !t.deleted_at)
      .map((t) => ({ day: doneDay(t.completed_at || t.logged_at), task: t })),
    ...store.projects.filter((p) => p.logged_at && p.status === 'completed' && !p.deleted_at)
      .map((p) => ({ day: doneDay(p.completed_at || p.logged_at), project: p })),
  ].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const days = [...new Set(entries.map((e) => e.day))];
  const label = (d: string) => (d === today ? 'Сегодня' : d === yesterday ? 'Вчера' : shortDate(d));
  const dateCol = (d: string) => (d === today ? 'сегодня' : shortDate(d));
  const areaName = (p: Project) => store.areas.find((a) => a.id === p.area_id)?.name;

  const pending = store.tasks.some((t) => t.status === 'completed' && !t.logged_at && !t.deleted_at)
    || store.projects.some((p) => p.status === 'completed' && !p.logged_at);

  return (
    <>
      <BadgeHeader icon="log" title="Журнал" lime right={pending ? (
        <button type="button" className="head-btn" title="Shift+⌘Y" onClick={() => logNow()}>
          <Icon name="log" size={16} color="#3E423C" />Перенести выполненные
        </button>
      ) : undefined} />
      {days.length === 0 && (
        <div className="empty">
          <span className="empty-badge"><Icon name="log" size={30} color="#3D6A00" /></span>
          <span className="empty-title">Журнал пуст</span>
          <span className="empty-hint">Сюда переносятся выполненные задачи и завершённые проекты — Shift+⌘Y или режим из настроек.</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {days.map((d) => {
          const list = entries.filter((e) => e.day === d);
          return (
            <section key={d} className="group">
              <div className="group-head"><h2>{label(d)}</h2></div>
              <TaskList tasks={list.filter((e) => e.task).map((e) => e.task!)}
                mode={{ showProject: true, alwaysSkill: true, logDate: (t) => dateCol(doneDay(t.completed_at || t.logged_at)) }} />
              {list.filter((e) => e.project).map(({ project: p }) => (
                <Link key={p!.id} to={`/project/${p!.id}`} className="log-project">
                  <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="Проект завершён" style={{ flexShrink: 0, marginTop: 2 }}>
                    <circle cx="8" cy="8" r="7.5" fill="#3D6A00" />
                    <path d="M4.8 8.2l2.1 2.1L11.3 6" fill="none" stroke="#FFFFFF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="log-date">{dateCol(d)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, lineHeight: '20px' }}>{p!.name || 'Новый проект'}</span>
                    <span className="row-sub">Проект{areaName(p!) ? ` · ${areaName(p!)}` : ''}</span>
                  </span>
                  <Icon name="chevronDown" size={16} color="#8E9289" width={2} style={{ transform: 'rotate(-90deg)', marginTop: 2 }} />
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
