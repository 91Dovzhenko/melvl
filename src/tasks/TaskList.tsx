import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../ui/icons';
import { useStore, useToday } from '../lib/store';
import { addDays, dueChip, fmtMin, shortDate } from '../lib/dates';
import { projectName, skillOf } from '../lib/views';
import { EstimatePicker, SkillGlyph, SkillPicker, WhenPicker } from './pickers';
import { MovePicker, TaskContextMenu, useTaskActions } from './actions';
import { RepeatDialog, templateOf } from './repeat';
import { describe } from '../lib/repeat';
import type { Task } from '../lib/types';
import { useEditing } from './editing';
import { useIsPhone } from '../ui/useIsPhone';
import { completeFields } from '../lib/logbook';

export type RowMode = {
  /** Показывать проект под задачей. */
  showProject?: boolean;
  /** Метки срока перед названием (экран проекта). */
  dueChips?: boolean;
  /** Навык виден всегда (Журнал), иначе — при наведении. */
  alwaysSkill?: boolean;
  /** Журнал: колонка даты выполнения слева (12/800, ширина 58). */
  logDate?: (t: Task) => string;
};

/** Список задач с выделением, раскрытием карточки и местом для новой задачи. */
export function TaskList({ tasks, mode = {}, draftHere = false }: { tasks: Task[]; mode?: RowMode; draftHere?: boolean }) {
  const ed = useEditing();
  const phoneLayout = useIsPhone();
  // На iPhone новая задача — карточкой сверху экрана (PhoneNewTask), не в списке.
  if (phoneLayout) draftHere = false;
  const draftAfter = ed.draft?.afterId ?? null;
  const items: React.ReactNode[] = [];
  if (ed.draft && draftHere && draftAfter === null && tasks.length === 0) items.push(<TaskCard key="draft" />);
  tasks.forEach((t, i) => {
    items.push(ed.editingId === t.id ? <TaskCard key={t.id} task={t} /> : <TaskRow key={t.id} task={t} mode={mode} />);
    if (ed.draft && draftAfter === t.id && !phoneLayout) items.push(<TaskCard key="draft" />);
    if (ed.draft && draftHere && draftAfter === null && i === tasks.length - 1) items.push(<TaskCard key="draft" />);
  });
  return <div className="task-list">{items}</div>;
}

function Checkbox({ task, size }: { task: Task; size: 'mac' | 'phone' }) {
  if (task.is_template) {
    // Шаблон повтора не выполняется — выполняются его копии.
    return <span className={'cb dashed' + (size === 'phone' ? ' cb-phone' : '')} title="Шаблон повтора" aria-hidden="true" style={{ opacity: .5 }} />;
  }
  return <CheckboxInner task={task} size={size} />;
}

function CheckboxInner({ task, size }: { task: Task; size: 'mac' | 'phone' }) {
  const { patch, settings } = useStore();
  const done = task.status === 'completed';
  return (
    <button type="button" className={'cb' + (done ? ' done' : '') + (task.someday ? ' dashed' : '') + (size === 'phone' ? ' cb-phone' : '')}
      aria-label={(done ? 'Снять отметку: ' : 'Выполнить: ') + (task.title || 'задача')}
      onClick={(e) => {
        e.stopPropagation();
        // Снять отметку — задача возвращается в работу (и из Журнала тоже).
        patch('tasks', task.id, done
          ? { status: 'open', completed_at: null, logged_at: null }
          : completeFields(settings.log_mode));
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
  const skill = skillOf(store, task).skill;
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  let chip: React.ReactNode = null;
  if (mode.dueChips) {
    // Шаблон повтора (раздел 7): есть открытая копия — «Ожидание»; нет — дата следующей копии в формате меток срока.
    const rule = task.is_template ? store.rules.find((r) => r.task_id === task.id) : undefined;
    const openCopy = task.is_template && store.tasks.some((c) => c.repeat_template_id === task.id && c.status === 'open' && !c.deleted_at && !c.logged_at);
    if (task.is_template) {
      chip = openCopy || !rule?.next_date
        ? <span className="due-chip" title={rule?.next_date ? `Следующая копия: ${shortDate(rule.next_date)}` : 'Ждёт выполнения копии'}>Ожидание</span>
        : <span className="due-chip" title={`Следующая копия: ${shortDate(rule.next_date)}`}>{dueChip(rule.next_date, today)}</span>;
    } else if (task.someday) chip = <span className="due-chip">Когда-нибудь</span>;
    else if (task.when_date && task.when_date <= today) chip = <TodaySquare />;
    else if (task.when_date) chip = <span className="due-chip">{dueChip(task.when_date, today)}</span>;
  }

  return (
    <div className={'row' + (selected ? ' selected' : '') + (phone ? ' row-phone' : '') + (sub ? ' has-sub' : '')}
      onClick={() => (phone ? ed.open(task.id) : ed.select(task.id))}
      onDoubleClick={() => ed.open(task.id)}
      onContextMenu={(e) => {
        if (phone) return;
        e.preventDefault();
        ed.select(task.id);
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}>
      {menuAt && <TaskContextMenu task={task} at={menuAt} onClose={() => setMenuAt(null)} />}
      <Checkbox task={task} size={phone ? 'phone' : 'mac'} />
      {mode.logDate && <span className="log-date">{mode.logDate(task)}</span>}
      <div className="row-body" style={{ opacity: done && !mode.logDate ? 0.42 : 1 }}>
        {/* Одна строка текста, как в Things: метка срока перед названием, название переносится,
            иконки и оценка идут сразу за последним словом. */}
        <div className="row-line">
          {chip && <span className="lead">{chip}</span>}
          <span className="row-title">{task.title || <span className="muted">Без названия</span>}</span>
          {task.notes.trim() && <span className="trail icon"><Icon name="note" size={13} color="#8E9289" width={1.9} /></span>}
          {(task.is_template || task.repeat_template_id) && (
            <span className="trail icon" role="img" aria-label={task.is_template ? 'Шаблон повтора' : 'Копия повтора'}>
              {/* Шаблон — «акцент тёмный» (синего в палитре нет, решено 13 нояб.), копия — серая. */}
              <Icon name="repeat" size={13} color={task.is_template ? '#3D6A00' : '#8E9289'} width={1.9} />
            </span>
          )}
          {task.estimate_min !== null && <span className="trail"><span className="est">{fmtMin(task.estimate_min)}</span></span>}
          {skill && !phone && (
            <span className="trail">
              <span className={'skill-pill' + (mode.alwaysSkill ? '' : ' hover-only')}>
                <SkillGlyph skill={skill} size={12} color="#3D6A00" />{skill.name}
              </span>
            </span>
          )}
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
  const act = useTaskActions();
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
  const { setCommit } = ed;
  useEffect(() => {
    setCommit(() => commitRef.current());
    return () => setCommit(null);
  }, [setCommit]);

  useEffect(() => {
    // iPhone, существующая задача: без клавиатуры (как в Things) — видны свойства и панель действий;
    // карточка прокручивается так, чтобы её низ был выше панели. Новая задача — сразу в название.
    if (phone && task) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Свойства: у сохранённой задачи — сразу в базу, у новой — в черновик.
  const set = (changes: Partial<Task>) => (task ? store.patch('tasks', task.id, changes) : ed.patchDraft(changes));
  const [pop, setPop] = useState<{ kind: PropKind; anchor: HTMLElement } | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const openPop = (kind: PropKind) => (e: React.MouseEvent<HTMLElement>) => setPop({ kind, anchor: e.currentTarget });
  const sk = skillOf(store, { skill_id: fields.skill_id ?? null, project_id: fields.project_id ?? null });
  const inheritedSkill = skillOf(store, { skill_id: null, project_id: fields.project_id ?? null }).skill;

  const chips: { key: PropKind; cls?: string; label: string; node: React.ReactNode }[] = [];
  if (fields.someday) chips.push({ key: 'when', label: 'Когда', node: <><Icon name="someday" size={14} color="#3E423C" width={1.9} />Когда-нибудь</> });
  else if (fields.when_date) {
    const isTodayDate = fields.when_date <= today;
    chips.push({
      key: 'when', label: 'Когда',
      node: isTodayDate
        ? <><TodaySquare size={16} />{fields.when_evening ? 'Сегодня вечером' : 'Сегодня'}</>
        : <><Icon name="when" size={14} color="#3E423C" width={1.9} />{fields.when_date === addDays(today, 1) ? 'Завтра' : shortDate(fields.when_date)}</>,
    });
  }
  if (fields.estimate_min != null) chips.push({ key: 'est', label: 'Оценка', node: <><Icon name="estimate" size={14} color="#3E423C" width={1.9} />{fmtMin(fields.estimate_min)}</> });
  const tpl = task ? templateOf(store.tasks, task) : null;
  const rule = tpl ? store.rules.find((r) => r.task_id === tpl.id) : undefined;
  if (rule) chips.push({
    key: 'repeat', label: 'Повтор',
    node: <><Icon name="repeat" size={14} color="#3E423C" width={1.9} />{describe(rule)}
      {/* Задача 13: подпись «привычка» — вторая часть плашки, как «из проекта» у навыка. */}
      {rule.is_habit && <span className="sub">· привычка</span>}
      {task?.is_template && <span className="sub">· {rule.next_date ? `следующая ${shortDate(rule.next_date)}` : 'после выполнения копии'}</span>}
      {task?.repeat_template_id && <span className="sub">· копия</span>}</>,
  });
  if (sk.skill) chips.push({
    key: 'skill', cls: 'skill', label: 'Навык',
    node: <><SkillGlyph skill={sk.skill} size={14} color="#3D6A00" />{sk.skill.name}{sk.inherited && <span className="sub">· из проекта</span>}</>,
  });
  if (fields.project_id) chips.push({ key: 'proj', label: 'Проект', node: <><Icon name="project" size={14} color="#3E423C" width={1.9} />{projectName(store, fields.project_id)}</> });

  const unset: { key: PropKind; icon: IconName; label: string }[] = [];
  if (!fields.when_date && !fields.someday && !fields.is_template) unset.push({ key: 'when', icon: 'when', label: 'Когда' });
  if (fields.estimate_min == null) unset.push({ key: 'est', icon: 'estimate', label: 'Оценка' });
  if (!sk.skill) unset.push({ key: 'skill', icon: 'skill', label: 'Навык' });
  if (!fields.project_id) unset.push({ key: 'proj', icon: 'project', label: 'Переместить в проект' });

  return (
    <div className={'card' + (phone ? ' card-phone' : '')} ref={ref}>
      <div className="card-head">
        {task ? <Checkbox task={task} size={phone ? 'phone' : 'mac'} /> : <span className={'cb' + (phone ? ' cb-phone' : '')} aria-hidden="true" />}
        <textarea ref={titleRef} className="card-title" rows={1} value={title} placeholder="Новая задача"
          aria-label="Название задачи"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          enterKeyHint="done"
          // Enter в названии — завершить, как клик вне карточки. Заметки — кликом по «Заметки».
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commitRef.current(); }
          }} />
      </div>
      <textarea ref={notesRef} className="card-notes" rows={1} value={notes} placeholder="Заметки"
        aria-label="Заметки" onChange={(e) => setNotes(e.target.value)} />
      <div className="card-foot">
        <div className="card-chips">
          {chips.map((c) => (
            <button key={c.key} type="button" className={'prop-chip' + (c.cls ? ' ' + c.cls : '')} aria-label={`${c.label}: изменить`}
              onClick={openPop(c.key)}>{c.node}</button>
          ))}
        </div>
        <div className="card-buttons">
          {unset.map((u) => (
            <button key={u.key} type="button" className="prop-btn" aria-label={u.label} title={u.label} onClick={openPop(u.key)}>
              <Icon name={u.icon} size={17} color="#3E423C" />
            </button>
          ))}
          {!rule && (
            <button type="button" className="prop-btn" aria-label="Повтор" title={task ? 'Повтор' : 'Повтор — после сохранения задачи'}
              disabled={!task} onClick={() => setRepeatOpen(true)}>
              <Icon name="repeat" size={17} color="#3E423C" />
            </button>
          )}
          <button type="button" className="prop-btn" aria-label="Дедлайн" title="Дедлайн — этап 3" disabled>
            <Icon name="deadline" size={17} color="#8E9289" />
          </button>
        </div>
      </div>
      {pop?.kind === 'when' && (
        <WhenPicker anchor={pop.anchor} onClose={() => setPop(null)} onPick={set}
          value={{ when_date: fields.when_date ?? null, when_evening: !!fields.when_evening, someday: !!fields.someday }} />
      )}
      {pop?.kind === 'est' && (
        <EstimatePicker anchor={pop.anchor} onClose={() => setPop(null)} value={fields.estimate_min ?? null}
          onPick={(v) => set({ estimate_min: v })} />
      )}
      {pop?.kind === 'skill' && (
        <SkillPicker anchor={pop.anchor} onClose={() => setPop(null)} value={fields.skill_id ?? null} inherited={inheritedSkill}
          onPick={(id) => set({ skill_id: id })} />
      )}
      {pop?.kind === 'repeat' && task && <RepeatDialog task={task} onClose={() => setPop(null)} />}
      {repeatOpen && task && <RepeatDialog task={task} onClose={() => setRepeatOpen(false)} />}
      {pop?.kind === 'proj' && (
        <MovePicker anchor={pop.anchor} onClose={() => setPop(null)}
          task={{ project_id: fields.project_id ?? null, area_id: fields.area_id ?? null }}
          onPick={(to) => (task ? act.move(task, to) : ed.patchDraft(to))} />
      )}
    </div>
  );
}

type PropKind = 'when' | 'est' | 'skill' | 'proj' | 'repeat';
