import { useStore } from '../lib/store';
import { inboxTasks } from '../lib/views';
import { TaskList } from '../tasks/TaskList';
import { useNewTaskContext } from '../tasks/editing';
import { BadgeHeader } from './parts';

export function Inbox() {
  const store = useStore();
  const tasks = inboxTasks(store);
  // Во Входящих новая задача ничего не наследует.
  useNewTaskContext({ defaults: {}, list: tasks });
  return (
    <>
      <BadgeHeader icon="inbox" title="Входящие" lime />
      <div style={{ marginTop: 4 }}>
        <TaskList tasks={tasks} draftHere />
      </div>
      <p className="foot-note">Задачи без проекта и без срока. Разберите их: назначьте «когда» или перенесите в проект.</p>
    </>
  );
}
