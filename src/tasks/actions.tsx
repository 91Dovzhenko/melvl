import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { orderAfter, skillOf, sortedAreas } from '../lib/views';
import { EstimatePicker, SkillPicker, WhenPicker } from './pickers';
import type { Task } from '../lib/types';
import { Icon, Ring } from '../ui/icons';
import { Pop, PopItem, PopSep, type Anchor } from '../ui/Pop';
import { menuProjects } from '../shell/Sidebar';
import { useEditing } from './editing';

/** Действия с задачей — общие для панели, меню «…» и меню правого клика. */
export function useTaskActions() {
  const store = useStore();
  const ed = useEditing();
  const nav = useNavigate();
  return {
    remove(t: Task) {
      if (ed.editingId === t.id) ed.close();
      if (ed.selectedId === t.id) ed.select(null);
      store.withUndo('Задача удалена', () => store.remove('tasks', t.id));
    },
    move(t: Task, to: { project_id: string | null; area_id: string | null }) {
      ed.commitOpen();
      store.withUndo('Задача перемещена', () => store.patch('tasks', t.id, to));
    },
    duplicate(t: Task) {
      ed.commitOpen();
      const fresh = store.tasks.find((x) => x.id === t.id) ?? t;
      const siblings = store.tasks.filter((x) => x.project_id === fresh.project_id && !x.deleted_at);
      let copyId = '';
      store.withUndo('Задача продублирована', () => {
        const { id: _id, created_at: _c, completed_at: _d, logged_at: _l, repeat_template_id: _r, repeat_date: _rd, ...rest } = fresh;
        void _id; void _c; void _d; void _l; void _r; void _rd;
        copyId = store.insert('tasks', {
          ...rest, status: 'open',
          sort_order: orderAfter(siblings, fresh, 'sort_order'),
          today_order: orderAfter(store.tasks.filter((x) => !x.deleted_at), fresh, 'today_order'),
        }).id;
      });
      ed.select(copyId);
    },
    /** Новый проект в той же области с названием и заметками задачи; задача удаляется. */
    makeProject(t: Task) {
      ed.commitOpen();
      const fresh = store.tasks.find((x) => x.id === t.id) ?? t;
      const area = fresh.area_id ?? store.projects.find((p) => p.id === fresh.project_id)?.area_id ?? null;
      const siblings = store.projects.filter((p) => p.area_id === area);
      let pid = '';
      store.withUndo('Задача стала проектом', () => {
        pid = store.insert('projects', {
          area_id: area, name: fresh.title, notes: fresh.notes,
          sort_order: Math.max(0, ...siblings.map((p) => p.sort_order)) + 1,
        }).id;
        store.remove('tasks', fresh.id);
      });
      ed.close();
      nav(`/project/${pid}`);
    },
  };
}

/** Окно «Переместить»: Входящие, проекты без области, области с проектами. */
type Place = { project_id: string | null; area_id: string | null };
export function MovePicker({ task, anchor, onClose, onPick }: {
  task: Place; anchor: Anchor | null; onClose: () => void; onPick: (to: Place) => void;
}) {
  const store = useStore();
  const projects = menuProjects(store.projects).filter((p) => p.status === 'open');
  const go = (to: Place) => { onClose(); onPick(to); };
  const inInbox = !task.project_id && !task.area_id;
  return (
    <Pop anchor={anchor} onClose={onClose} title="Переместить" width={280}>
      <PopItem icon="inbox" label="Входящие" selected={inInbox} onClick={() => go({ project_id: null, area_id: null })} />
      {projects.filter((p) => !p.area_id).map((p) => (
        <ProjectItem key={p.id} name={p.name} selected={task.project_id === p.id} onClick={() => go({ project_id: p.id, area_id: null })} />
      ))}
      {sortedAreas(store).map((a) => (
        <div key={a.id} style={{ display: 'contents' }}>
          <PopSep />
          <PopItem icon="area" label={a.name || 'Новая область'} selected={!task.project_id && task.area_id === a.id}
            onClick={() => go({ project_id: null, area_id: a.id })} />
          {projects.filter((p) => p.area_id === a.id).map((p) => (
            <ProjectItem key={p.id} name={p.name} selected={task.project_id === p.id} onClick={() => go({ project_id: p.id, area_id: null })} />
          ))}
        </div>
      ))}
    </Pop>
  );
}

function ProjectItem({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={'pop-item' + (selected ? ' selected' : '')} aria-pressed={selected} onClick={onClick} title={name}>
      <span style={{ display: 'flex', width: 17, justifyContent: 'center' }}><Ring size={16} progress={0} /></span>
      <span className="pop-label" style={{ fontWeight: 600 }}>{name || 'Новый проект'}</span>
      {selected && <Icon name="check" size={15} color="#C5F25A" width={2.4} />}
    </button>
  );
}

/** Меню «…» раскрытой задачи. */
export function TaskMoreMenu({ task, anchor, onClose }: { task: Task; anchor: Anchor | null; onClose: () => void }) {
  const act = useTaskActions();
  return (
    <Pop anchor={anchor} onClose={onClose} title="Действия с задачей" width={240}>
      <PopItem icon="duplicate" label="Дублировать" onClick={() => { onClose(); act.duplicate(task); }} />
      <PopItem icon="project" label="Сделать проектом" onClick={() => { onClose(); act.makeProject(task); }} />
      <PopItem icon="repeat" label="Повторять" hint="скоро" disabled />
    </Pop>
  );
}

/**
 * Панель действий раскрытой задачи: Переместить · корзина · «…».
 * Mac — в нижней панели (52), iPhone — плавающая тёмная панель над низом экрана.
 */
export function TaskActionBar({ task, floating }: { task: Task; floating?: boolean }) {
  const act = useTaskActions();
  const [open, setOpen] = useState<'move' | 'more' | null>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const color = floating ? '#FFFFFF' : '#3E423C';
  return (
    <div className={floating ? 'float-bar' : 'action-bar'} data-keep-card role="toolbar" aria-label="Действия с задачей">
      <button ref={moveRef} type="button" className="action-btn" aria-expanded={open === 'move'}
        onClick={() => setOpen(open === 'move' ? null : 'move')}>
        <Icon name="move" size={floating ? 22 : 18} color={color} />Переместить
      </button>
      <button type="button" className="action-btn icon-only" aria-label="Удалить задачу" title="Удалить задачу"
        onClick={() => act.remove(task)}>
        <Icon name="trash" size={floating ? 22 : 18} color={color} />
      </button>
      <button ref={moreRef} type="button" className="action-btn icon-only" aria-label="Ещё" title="Ещё" aria-expanded={open === 'more'}
        onClick={() => setOpen(open === 'more' ? null : 'more')}>
        <Icon name="more" size={floating ? 22 : 18} color={color} width={3} />
      </button>
      {open === 'move' && <MovePicker task={task} anchor={moveRef.current} onClose={() => setOpen(null)} onPick={(to) => act.move(task, to)} />}
      {open === 'more' && <TaskMoreMenu task={task} anchor={moreRef.current} onClose={() => setOpen(null)} />}
    </div>
  );
}

type Sub = 'when' | 'move' | 'est' | 'skill' | null;

/** Окна свойств для задачи вне карточки (меню правого клика, нижняя панель Mac). */
export function TaskPropPicker({ task, kind, anchor, onClose }: { task: Task; kind: Exclude<Sub, null>; anchor: Anchor; onClose: () => void }) {
  const store = useStore();
  const act = useTaskActions();
  const patch = (c: Partial<Task>) => store.patch('tasks', task.id, c);
  if (kind === 'when') return <WhenPicker anchor={anchor} onClose={onClose} onPick={patch} value={task} />;
  if (kind === 'est') return <EstimatePicker anchor={anchor} onClose={onClose} value={task.estimate_min} onPick={(v) => patch({ estimate_min: v })} />;
  if (kind === 'skill') {
    const inherited = skillOf(store, { skill_id: null, project_id: task.project_id }).skill;
    return <SkillPicker anchor={anchor} onClose={onClose} value={task.skill_id} inherited={inherited} onPick={(id) => patch({ skill_id: id })} />;
  }
  return <MovePicker task={task} anchor={anchor} onClose={onClose} onPick={(to) => act.move(task, to)} />;
}

/** Меню по правому клику: Когда · Переместить · Оценка · Навык · Повторять · Дублировать · Сделать проектом · Удалить. */
export function TaskContextMenu({ task, at, onClose }: { task: Task; at: { x: number; y: number }; onClose: () => void }) {
  const act = useTaskActions();
  const [sub, setSub] = useState<Sub>(null);
  if (sub) return <TaskPropPicker task={task} kind={sub} anchor={at} onClose={onClose} />;
  const item = (icon: React.ComponentProps<typeof PopItem>['icon'], label: string, run: () => void, disabled?: boolean) => (
    <PopItem icon={icon} label={label} disabled={disabled} onClick={run} />
  );
  return (
    <Pop anchor={at} onClose={onClose} variant="light" width={240} title="Действия с задачей">
      {item('when', 'Когда…', () => setSub('when'))}
      {item('move', 'Переместить…', () => setSub('move'))}
      {item('estimate', 'Оценка…', () => setSub('est'))}
      {item('skill', 'Навык…', () => setSub('skill'))}
      {item('repeat', 'Повторять…', () => {}, true)}
      <PopSep />
      {item('duplicate', 'Дублировать', () => { onClose(); act.duplicate(task); })}
      {item('project', 'Сделать проектом…', () => { onClose(); act.makeProject(task); })}
      <PopSep />
      {item('trash', 'Удалить', () => { onClose(); act.remove(task); })}
    </Pop>
  );
}
