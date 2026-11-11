import { useParams } from 'react-router-dom';
import { Icon, Ring, type IconName } from '../ui/icons';
import { projectProgress, type ShellData } from '../lib/data';

type Kind = 'inbox' | 'today' | 'plans' | 'log' | 'project' | 'area';

const META: Record<Exclude<Kind, 'project' | 'area'>, { title: string; icon: IconName; lime?: boolean; empty: string; hint: string }> = {
  inbox: { title: 'Входящие', icon: 'inbox', empty: 'Во Входящих пусто', hint: 'Сюда попадают задачи без проекта и без срока.' },
  today: { title: 'Сегодня', icon: 'today', lime: true, empty: 'На сегодня ничего нет', hint: 'Перенесите задачи из Входящих или проектов либо нажмите ⌘N, чтобы создать новую' },
  plans: { title: 'Планы', icon: 'plans', empty: 'Планов пока нет', hint: 'Здесь будут задачи с датой после сегодня, по дням.' },
  log: { title: 'Журнал', icon: 'log', empty: 'Журнал пуст', hint: 'Сюда переносятся выполненные задачи и проекты — Shift+⌘Y.' },
};

/** Экран раздела. Этап 0 — шапка и пустое состояние; списки задач — этап 1. */
export function Section({ kind, data, phone }: { kind: Kind; data: ShellData; phone: boolean }) {
  const { id } = useParams();
  let title: string;
  let badge: React.ReactNode;
  let empty: string;
  let hint: string;

  if (kind === 'project') {
    const p = data.projects.find((x) => x.id === id);
    title = p ? p.name || 'Новый проект' : data.loading ? '' : 'Проект не найден';
    badge = <span style={{ marginTop: phone ? 3 : 0, display: 'flex' }}><Ring size={28} progress={p ? projectProgress(p.id, data.tasks) : 0} /></span>;
    empty = 'Нажмите ⌘N, чтобы создать задачу';
    hint = '';
  } else if (kind === 'area') {
    const a = data.areas.find((x) => x.id === id);
    title = a ? a.name || 'Новая область' : data.loading ? '' : 'Область не найдена';
    badge = <span className="title-badge quiet"><Icon name="area" size={phone ? 19 : 22} color="#5F635C" /></span>;
    empty = 'В области пока нет проектов';
    hint = '';
  } else {
    const m = META[kind];
    title = m.title;
    badge = (
      <span className={'title-badge ' + (m.lime ? 'lime' : 'quiet')}>
        <Icon name={m.icon} size={phone ? 19 : 22} color="#15171A" width={m.lime ? 2 : 1.8} />
      </span>
    );
    empty = m.empty;
    hint = m.hint;
  }

  if (phone) { empty = empty.replace('⌘N', '«+»'); hint = hint.replace('⌘N', '«+»'); }

  const emptyIcon: IconName = kind === 'project' ? 'plus' : kind === 'area' ? 'area' : META[kind].icon;

  return (
    <>
      <header className={phone ? 'phone-title' : 'screen-head'}>
        <div className="screen-title" style={phone ? { gap: 10, flex: 1, alignItems: 'flex-start' } : undefined}>
          {badge}
          <h1 className="title">{title}</h1>
        </div>
      </header>

      {kind === 'today' && (
        <div className="events-slot">
          <Icon name="when" size={16} color="#8E9289" />
          <span>События календаря — появятся на этапе 3</span>
        </div>
      )}

      <div className="empty">
        <span className="empty-badge"><Icon name={emptyIcon} size={30} color="#3D6A00" /></span>
        <span className="empty-title">{empty}</span>
        {hint && <span className="empty-hint">{hint}</span>}
      </div>
    </>
  );
}
