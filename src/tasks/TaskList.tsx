import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../ui/icons';
import { useStore, useToday } from '../lib/store';
import { dueChip, fmtMin, shortDate } from '../lib/dates';
import { projectName } from '../lib/views';
import type { Task } from '../lib/types';
import { useEditing } from './editing';
import { useIsPhone } from '../ui/useIsPhone';

export type RowMode = {
  /** Показывать проект под задачей. */
  showProject?: boolean;
  /** Метки срока перед названием (экран проекта). */
  dueChips?: boolean;
};

/** Список задач с выделением, раскрытием карточки и местом для новой задачи. */
export function TaskList({ tasks, mode = {}, draftHere = false }: { tasks: Task[]; mode?: RowMode; draftHere?: boolean }) {
  const ed = useEditing();
  const draftAfter = ed.draft?.afterId ?? null;
  const items: React.ReactNode[] = [];
  if (ed.draft && draftHere && draftAfter === null && tasks.length === 0) items.push(<TaskCard key="draft" />);
  tasks.forEach((t, i) => {
    items.push(ed.editingId === t.id ? <TaskCard key={t.id} task={t} /> : <TaskRow key={t.id} task={t} mode={mode} />);
    if (ed.draft && draftAfter === t.id) items.push(<TaskCard key="draft" />);
    if (ed.draft && draftHere && draftAfter === null && i === tasks.length - 1) items.push(<TaskCard key="draft" />);
  });
  return <div className="task-list">{items}</div>;
}

function Checkbox({ task, size }: { task: Task; size: 'mac' | 'phone' }) {
  const { patch } = useStore();
  const done = task.status === 'completed';
  return (
    <button type="button" className={'cb' + (done ? ' done' : '') + (task.someday ? ' dashed' : '') + (size === 'phone' ? ' cb-phone' : '')}
      aria-label={(done ? 'Снять отметку: ' : 'Выполнить: ') + (task.title || 'задача')}
      onClick={(e) => {
        e.stopPropagation();
        patch('tasks', task.id, done
          ? { status: 'open', completed_at: null }
          : { status: 'completed', completed_at: new Date().toISOString() });
      }}>
      {done && (
        <svg width={size === 'phone' ? 13 : 10} height={size === 'phone' ? 13 : 10} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.4 6.3l2.4 2.4L9.6 3.8" stroke="#15171A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function TodaySquare({ size = 18 }: { size?: number }) {
  return (
    <span className="today-sq" title="Сегодня" style={{ width: size, height: size }}>
      <Icon name="today" size={size - 6} width={2.4} />
    </span>
  );
}

export function TaskRow({ task, mode }: { task: Task; mode: RowMode }) {
  const store = useStore();
  const ed = useEditing();
  const today = useToday();
  const phone = useIsPhone();
  const done = task.status === 'completed';
  const selected = ed.selectedId === task.id;
  const sub = mode.showProject ? projectName(store, task.project_id) : '';

  let chip: React.ReactNode = null;
  if (mode.dueChips) {
    if (task.someday) chip = <span className="due-chip">Когда-нибудь</span>;
    else if (task.when_date && task.when_date <= today) chip = <TodaySquare />;
    else if (task.when_date) chip = <span className="due-chip">{dueChip(task.when_date, today)}</span>;
  }

  return (
    <div className={'row' + (selected ? ' selected' : '') + (phone ? ' row-phone' : '')}
      onClick={() => (phone ? ed.open(task.id) : ed.select(task.id))}
      onDoubleClick={() => ed.open(task.id)}>
      <Checkbox task={task} size={phone ? 'phone' : 'mac'} />
      <div className="row-body" style={{ opacity: done ? 0.42 : 1 }}>
        <div className="row-line">
          {chip}
          <span className="row-title">{task.title || <span className="muted">Без названия</span>}</span>
          {task.notes.trim() && <Icon name="note" size={13} color="#8E9289" width={1.9} />}
          {task.estimate_min !== null && <span className="est">{fmtMin(task.estimate_min)}</span>}
        </div>
        {sub && <span className="row-sub" title={sub}>{sub}</span>}
      </div>
    </div>
  );
}

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = el.scrollHeight + 'px';
}

/** Раскрытая карточка: та же задача на месте строки, или новая (task не задан). */
export function TaskCard({ task }: { task?: Task }) {
  const store = useStore();
  const ed = useEditing();
  const today = useToday();
  const phone = useIsPhone();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const state = useRef({ title, notes });
  state.current = { title, notes };
  const fields = task ?? (ed.draft?.fields as Partial<Task> | undefined) ?? {};

  const commit = () => {
    const { title: t, notes: n } = state.current;
    if (task) {
      const changes: Partial<Task> = {};
      if (t.trim() !== task.title) changes.title = t.trim();
      if (n !== task.notes) changes.notes = n;
      if (Object.keys(changes).length) store.patch('tasks', task.id, changes);
      ed.close();
    } else {
      ed.saveDraft(t, n);
    }
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useLayoutEffect(() => { autosize(titleRef.current); autosize(notesRef.current); }, [title, notes]);

  // Esc / клик вне карточки — закрыть и сохранить.
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest('[data-keep-card]')) commitRef.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); commitRef.current(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const chips: { key: string; node: React.ReactNode }[] = [];
  if (fields.someday) chips.push({ key: 'when', node: <><Icon name="someday" size={14} color="#3E423C" width={1.9} />Когда-нибудь</> });
  else if (fields.when_date) {
    const isTodayDate = fields.when_date <= today;
    chips.push({
      key: 'when',
      node: isTodayDate
        ? <><TodaySquare size={16} />{fields.when_evening ? 'Сегодня вечером' : 'Сегодня'}</>
        : <><Icon name="when" size={14} color="#3E423C" width={1.9} />{shortDate(fields.when_date)}</>,
    });
  }
  if (fields.estimate_min != null) chips.push({ key: 'est', node: <><Icon name="estimate" size={14} color="#3E423C" width={1.9} />{fmtMin(fields.estimate_min)}</> });
  if (fields.project_id) chips.push({ key: 'proj', node: <><Icon name="project" size={14} color="#3E423C" width={1.9} />{projectName(store, fields.project_id)}</> });

  const unset: { key: string; icon: IconName; label: string }[] = [];
  if (!fields.when_date && !fields.someday) unset.push({ key: 'when', icon: 'when', label: 'Когда' });
  if (fields.estimate_min == null) unset.push({ key: 'est', icon: 'estimate', label: 'Оценка' });
  unset.push({ key: 'skill', icon: 'skill', label: 'Навык' });
  if (!fields.project_id) unset.push({ key: 'proj', icon: 'project', label: 'Переместить в проект' });
  unset.push({ key: 'repeat', icon: 'repeat', label: 'Повтор' });

  return (
    <div className={'card' + (phone ? ' card-phone' : '')} ref={ref}>
      <div className="card-head">
        {task ? <Checkbox task={task} size={phone ? 'phone' : 'mac'} /> : <span className={'cb' + (phone ? ' cb-phone' : '')} aria-hidden="true" />}
        <textarea ref={titleRef} className="card-title" rows={1} value={title} placeholder="Новая задача"
          aria-label="Название задачи"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); notesRef.current?.focus(); } }} />
      </div>
      <textarea ref={notesRef} className="card-notes" rows={1} value={notes} placeholder="Заметки"
        aria-label="Заметки" onChange={(e) => setNotes(e.target.value)} />
      <div className="card-foot">
        <div className="card-chips">
          {chips.map((c) => <span key={c.key} className="prop-chip">{c.node}</span>)}
        </div>
        <div className="card-buttons">
          {unset.map((u) => (
            <button key={u.key} type="button" className="prop-btn" aria-label={u.label} title={`${u.label} — следующий пункт сборки`} disabled>
              <Icon name={u.icon} size={17} color="#3E423C" />
            </button>
          ))}
          <button type="button" className="prop-btn" aria-label="Дедлайн" title="Дедлайн — этап 3" disabled>
            <Icon name="deadline" size={17} color="#8E9289" />
          </button>
        </div>
      </div>
    </div>
  );
}
