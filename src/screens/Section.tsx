import { Icon } from '../ui/icons';
import { useNewTaskContext } from '../tasks/editing';
import { BadgeHeader } from './parts';

/** Планы и Журнал — п. 4 сборки. Пока шапка и пустое состояние. */
export function Placeholder({ kind }: { kind: 'plans' | 'log' }) {
  // Списков здесь пока нет — «+» ничего не создаёт (п. 4 сборки).
  useNewTaskContext({ defaults: {}, list: [], onNew: () => {} });
  const m = kind === 'plans'
    ? { title: 'Планы', icon: 'plans' as const, empty: 'Планы появятся в следующих пунктах', hint: 'Здесь будут задачи с датой после сегодня, по дням.' }
    : { title: 'Журнал', icon: 'log' as const, empty: 'Журнал появится в следующих пунктах', hint: 'Сюда переносятся выполненные задачи и проекты — Shift+⌘Y.' };
  return (
    <>
      <BadgeHeader icon={m.icon} title={m.title} />
      <div className="empty">
        <span className="empty-badge"><Icon name={m.icon} size={30} color="#3D6A00" /></span>
        <span className="empty-title">{m.empty}</span>
        <span className="empty-hint">{m.hint}</span>
      </div>
    </>
  );
}
