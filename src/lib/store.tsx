import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { addDays, iso, todayISO } from './dates';
import { repeatFirst, repeatNext, type RepeatRule } from './repeat';
import type { Area, Goal, GoalMeasurement, GoalStep, Project, Settings, Skill, TableName, Tables, Task } from './types';

export type Data = {
  areas: Area[]; projects: Project[]; tasks: Task[]; skills: Skill[];
  goals: Goal[]; goal_steps: GoalStep[]; goal_measurements: GoalMeasurement[];
  /** Удалённые копии привычек: в списках их нет, но в сводке главы они — «положено» (решение 13 нояб.). */
  habitGhosts: Task[];
  rules: RepeatRule[];
  settings: Settings;
  loading: boolean;
};

type Store = Data & {
  insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Tables[T];
  patch<T extends TableName>(table: T, id: string, changes: Partial<Tables[T]>): void;
  remove(table: TableName, id: string): void;
  /** Действие, которое можно отменить («Отменить» в плашке или ⌘Z). */
  withUndo(message: string, fn: () => void, onUndo?: () => void): void;
  /** Отменить последнее такое действие. false — отменять нечего. */
  undo(): boolean;
  toast: (msg: string, action?: ToastAction) => void;
  /** Настройки аккаунта (одна строка на владельца; RLS ограничивает своей). */
  patchSettings(changes: Partial<Settings>): void;
  /** Включить или изменить повтор: задача становится шаблоном, копии создаются по правилу (в базе). */
  setRepeat(taskId: string, r: RepeatInput): Promise<void>;
  /** Остановить повтор: шаблон становится обычной задачей. */
  stopRepeat(taskId: string): Promise<void>;
  /** Перечитать данные (например, после отметки копии «после выполнения»). */
  reload(): Promise<void>;
};

type ToastAction = { label: string; run: () => void };
export type RepeatInput = Pick<RepeatRule, 'kind' | 'every' | 'unit' | 'weekdays' | 'month_day' | 'end_date' | 'is_habit'> & { start: string };
type UndoStep =
  | { kind: 'insert'; table: TableName; id: string }
  | { kind: 'remove'; table: TableName; row: { id: string } }
  | { kind: 'patch'; table: TableName; id: string; prev: Record<string, unknown> };

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store not mounted');
  return s;
}

const DEFAULT_SETTINGS: Settings = { log_mode: 'manual', today_view: 'projects', last_auto_log: null, character_seen_at: null, tree_layout: null };
const SETTINGS_COLS = 'log_mode,today_view,last_auto_log,character_seen_at,tree_layout';
const TABLES = ['areas', 'projects', 'tasks', 'skills', 'goals', 'goal_steps', 'goal_measurements'] as const;

const now = () => new Date().toISOString();

function defaults<T extends TableName>(table: T, row: Partial<Tables[T]>): Tables[T] {
  const id = row.id ?? crypto.randomUUID();
  const base = { id, deleted_at: null, sort_order: Date.now() / 1000 };
  if (table === 'areas') return { ...base, name: '', ...row } as Tables[T];
  if (table === 'projects') return {
    ...base, area_id: null, name: '', notes: '', default_skill_id: null, is_quest: false,
    quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, ...row,
  } as Tables[T];
  if (table === 'tasks') return {
    ...base, project_id: null, area_id: null, title: '', notes: '', when_date: null, when_evening: false,
    someday: false, estimate_min: null, skill_id: null, deadline: null, status: 'open', completed_at: null,
    logged_at: null, today_order: Date.now() / 1000, repeat_template_id: null, repeat_date: null, is_template: false, is_habit: false, created_at: now(), ...row,
  } as Tables[T];
  if (table === 'goals') return {
    ...base, title: '', metric: '', start_value: 0, target_value: 0, criterion: '', calc: 'once', period_n: 3,
    period_unit: 'month', due_date: null, review_date: null, status: 'active', achieved_at: null, ...row,
  } as Tables[T];
  if (table === 'goal_steps') return {
    ...base, goal_id: '', title: '', threshold: 0, calc: 'goal', taken_at: null, taken_manual: false, ...row,
  } as Tables[T];
  if (table === 'goal_measurements') {
    // Дата замера — всегда из формы (локальный день); в базе значения по умолчанию нет.
    const { sort_order: _s, ...rest } = base;
    return { ...rest, goal_id: '', date: todayISO(), value: 0, comment: '', ...row } as Tables[T];
  }
  return { ...base, name: '', branch: 'creator', icon: '', active: true, created_at: now(), ...row } as Tables[T];
}

/**
 * Данные в памяти + запись в Supabase.
 * Правка применяется сразу; при ошибке сервера — откат и тихое сообщение.
 * `offline` — локальный просмотр без входа (только dev, ?preview): в базу ничего не пишется.
 */
export function StoreProvider({ children, offline, seed }: { children: React.ReactNode; offline?: boolean; seed?: Partial<Data> }) {
  const [data, setData] = useState<Data>({
    areas: [], projects: [], tasks: [], skills: [], goals: [], goal_steps: [], goal_measurements: [], habitGhosts: [],
    rules: [], settings: DEFAULT_SETTINGS, loading: !offline, ...seed,
  });
  const [toastMsg, setToastMsg] = useState<{ msg: string; action?: ToastAction } | null>(null);
  const recorder = useRef<UndoStep[] | null>(null);
  const undoStack = useRef<{ message: string; steps: UndoStep[]; onUndo?: () => void }[]>([]);
  const toastTimer = useRef<number | undefined>(undefined);
  const dataRef = useRef(data);
  dataRef.current = data;

  const toast = useCallback((msg: string, action?: ToastAction) => {
    setToastMsg({ msg, action });
    window.clearTimeout(toastTimer.current);
    // С кнопкой «Отменить» плашка держится 6 секунд (п. 6.8), иначе 3,5.
    toastTimer.current = window.setTimeout(() => setToastMsg(null), action ? 6000 : 3500);
  }, []);

  const load = useCallback(async () => {
    if (!supabase || offline) return;
    const init = await supabase.rpc('init_user');
    // Копии повторов на сегодня (по дате устройства); расписание в базе делает то же в 00:05 по Москве.
    const gen = await supabase.rpc('generate_my_repeats', { p_today: todayISO() });
    if (gen.error) console.warn('generate_my_repeats', gen.error.message);
    const [a, p, t, s, st, rr, g, gs, gm, hg] = await Promise.all([
      supabase.from('areas').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('projects').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('tasks').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('skills').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('settings').select(SETTINGS_COLS).maybeSingle(),
      supabase.from('repeat_rules').select('task_id,kind,every,unit,weekdays,month_day,anchor_date,next_date,end_date,is_habit'),
      supabase.from('goals').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('goal_steps').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('goal_measurements').select('*').is('deleted_at', null).order('date'),
      supabase.from('tasks').select('*').eq('is_habit', true).not('repeat_template_id', 'is', null).not('deleted_at', 'is', null),
    ]);
    const err = init.error || a.error || p.error || t.error || s.error || st.error || g.error || gs.error || gm.error;
    if (err) { toast('Не удалось загрузить данные'); console.error(err); }
    setData((d) => ({
      areas: (a.data as Area[]) ?? d.areas,
      projects: (p.data as Project[]) ?? d.projects,
      tasks: (t.data as Task[]) ?? d.tasks,
      skills: (s.data as Skill[]) ?? d.skills,
      goals: num(g.data as Goal[] | null, ['start_value', 'target_value']) ?? d.goals,
      goal_steps: num(gs.data as GoalStep[] | null, ['threshold']) ?? d.goal_steps,
      goal_measurements: num(gm.data as GoalMeasurement[] | null, ['value']) ?? d.goal_measurements,
      habitGhosts: (hg.data as Task[]) ?? d.habitGhosts,
      settings: (st.data as unknown as Settings) ?? d.settings,
      rules: (rr.data as RepeatRule[]) ?? d.rules,
      loading: false,
    }));
  }, [offline, toast]);

  // После полуночи — копии повторов на новый день.
  const today = useToday();
  const firstDay = useRef(today);
  useEffect(() => {
    if (today === firstDay.current) return;
    firstDay.current = today;
    if (offline) setData((d) => generateLocal(d, today));
    else void load();
  }, [today, load, offline]);

  useEffect(() => { void load(); }, [load]);
  const loadRef = useRef(load);
  loadRef.current = load;

  // Realtime (п. 6.6): изменения с других устройств приходят сразу.
  // Пока своя запись по строке не подтверждена сервером, события по ней не применяются —
  // иначе эхо предыдущей правки на миг откатило бы более новую.
  useEffect(() => {
    const sb = supabase;
    if (!sb || offline) return;
    let channel: ReturnType<typeof sb.channel> | null = null;
    let dropped = false;
    let alive = true;
    void sb.auth.getSession().then(({ data: s }) => {
      const uid = s.session?.user.id;
      if (!alive || !uid) return;
      channel = sb.channel('melvl-' + uid);
      for (const table of [...TABLES, 'repeat_rules', 'settings'] as const) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `owner=eq.${uid}` },
          (e) => applyRemote(table, e.eventType, e.new as Record<string, unknown>, e.old as Record<string, unknown>));
      }
      // На события DELETE фильтр по owner не действует — подписка на них отдельно, без фильтра (ключи — uuid, чужих строк в данных нет).
      for (const table of ['repeat_rules'] as const) {
        channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table },
          (e) => applyRemote(table, 'DELETE', {}, e.old as Record<string, unknown>));
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Переподключились после обрыва — подтянуть то, что пропустили.
          if (dropped) void loadRef.current();
          dropped = false;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          dropped = true;
        }
      });
    });
    return () => { alive = false; if (channel) void sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  // iPhone усыпляет соединение, когда приложение свёрнуто, — при возврате на экран подтягиваем пропущенное.
  useEffect(() => {
    let last = 0;
    const on = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5000) return;
      last = Date.now();
      void load();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [load]);

  /** Строки, по которым своя запись ещё в пути (id → сколько запросов). */
  const pending = useRef(new Map<string, number>());
  const track = useCallback(<R,>(id: string, p: PromiseLike<R>) => {
    pending.current.set(id, (pending.current.get(id) ?? 0) + 1);
    const done = () => {
      const n = (pending.current.get(id) ?? 1) - 1;
      if (n <= 0) pending.current.delete(id); else pending.current.set(id, n);
    };
    return Promise.resolve(p).then((r) => { done(); return r; }, (e) => { done(); throw e; });
  }, []);

  const applyRemote = (table: TableName | 'repeat_rules' | 'settings', type: string, row: Record<string, unknown>, old: Record<string, unknown>) => {
    if (table === 'settings') {
      if (type === 'DELETE' || pending.current.has('settings')) return;
      const { log_mode, today_view, last_auto_log, character_seen_at, tree_layout } = row as Settings;
      setData((d) => ({ ...d, settings: { log_mode, today_view, last_auto_log, character_seen_at, tree_layout } }));
      return;
    }
    if (table === 'repeat_rules') {
      const key = (row.task_id ?? old.task_id) as string | undefined;
      if (!key) return;
      setData((d) => {
        const rest = d.rules.filter((r) => r.task_id !== key);
        return { ...d, rules: type === 'DELETE' ? rest : [...rest, row as unknown as RepeatRule] };
      });
      return;
    }
    const id = (row.id ?? old.id) as string | undefined;
    if (!id || pending.current.has(id)) return;
    setData((d) => {
      const rows = d[table] as { id: string }[];
      const rest = rows.filter((r) => r.id !== id);
      const gone = type === 'DELETE' || row.deleted_at;
      if (table === 'tasks') {
        const ghost = isHabitCopy(row) && !!row.deleted_at;
        const ghosts = d.habitGhosts.filter((x) => x.id !== id);
        d = { ...d, habitGhosts: ghost ? [...ghosts, row as unknown as Task] : ghosts };
      }
      if (gone) return rest.length === rows.length ? d : { ...d, [table]: rest };
      const i = rows.findIndex((r) => r.id === id);
      const fixed = num([row as never], NUMERIC[table as TableName] ?? [])![0] as Record<string, unknown>;
      const next = i < 0 ? [...rows, fixed] : rows.map((r, j) => (j === i ? { ...r, ...fixed } : r));
      return { ...d, [table]: next };
    });
  };

  const setTable = useCallback(<T extends TableName>(table: T, fn: (rows: Tables[T][]) => Tables[T][]) => {
    setData((d) => ({ ...d, [table]: fn(d[table] as Tables[T][]) }));
  }, []);

  const insert = useCallback(<T extends TableName>(table: T, row: Partial<Tables[T]>) => {
    const full = defaults(table, row);
    recorder.current?.push({ kind: 'insert', table, id: full.id });
    setTable(table, (rows) => [...rows, full]);
    if (supabase && !offline) {
      const payload = { ...full } as Record<string, unknown>;
      delete payload.created_at;
      track(full.id, supabase.from(table).insert(payload)).then(({ error }) => {
        if (error) {
          console.error(error);
          setTable(table, (rows) => rows.filter((r) => r.id !== full.id));
          toast('Не сохранилось — проверьте связь');
        }
      });
    }
    return full;
  }, [offline, setTable, toast, track]);

  const patch = useCallback(<T extends TableName>(table: T, id: string, changes: Partial<Tables[T]>) => {
    const prev = (dataRef.current[table] as Tables[T][]).find((r) => r.id === id);
    if (!prev) return;
    if (recorder.current) {
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(changes)) before[k] = (prev as Record<string, unknown>)[k];
      recorder.current.push({ kind: 'patch', table, id, prev: before });
    }
    setTable(table, (rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    // Отметили копию повтора «после выполнения» — в базе следующую дату ставит триггер; без входа — то же здесь.
    const copyDone = table === 'tasks' && (changes as Partial<Task>).status === 'completed' && (prev as Task).repeat_template_id;
    if (copyDone && (!supabase || offline)) setData((d) => afterCompletionLocal(d, prev as Task));
    if (supabase && !offline) {
      track(id, supabase.from(table).update(changes as Record<string, unknown>).eq('id', id)).then(({ error }) => {
        if (!error && copyDone) void loadRef.current();
        if (error) {
          console.error(error);
          setTable(table, (rows) => rows.map((r) => (r.id === id ? prev : r)));
          toast('Не сохранилось — проверьте связь');
        }
      });
    }
  }, [offline, setTable, toast, track]);

  /** Мягкое удаление: строка пропадает из интерфейса, в базе — пометка deleted_at. */
  const remove = useCallback((table: TableName, id: string) => {
    const prev = (dataRef.current[table] as { id: string }[]).find((r) => r.id === id);
    if (!prev) return;
    recorder.current?.push({ kind: 'remove', table, row: prev });
    setTable(table, (rows) => rows.filter((r) => r.id !== id));
    if (table === 'tasks' && isHabitCopy(prev as never)) {
      setData((d) => ({ ...d, habitGhosts: [...d.habitGhosts.filter((x) => x.id !== id), { ...(prev as Task), deleted_at: now() }] }));
    }
    if (supabase && !offline) {
      track(id, supabase.from(table).update({ deleted_at: now() }).eq('id', id)).then(({ error }) => {
        if (error) {
          console.error(error);
          setTable(table, (rows) => [...rows, prev as never]);
          toast('Не удалилось — проверьте связь');
        }
      });
    }
  }, [offline, setTable, toast, track]);

  /** Вернуть удалённые строки (deleted_at = null) и прежние значения полей — в обратном порядке. */
  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return false;
    for (const step of [...entry.steps].reverse()) {
      if (step.kind === 'insert') {
        remove(step.table, step.id);
      } else if (step.kind === 'remove') {
        const row = { ...step.row, deleted_at: null };
        setTable(step.table, (rows) => (rows.some((r) => r.id === row.id) ? rows : [...rows, row as never]));
        if (step.table === 'tasks') setData((d) => ({ ...d, habitGhosts: d.habitGhosts.filter((x) => x.id !== row.id) }));
        if (supabase && !offline) {
          track(row.id, supabase.from(step.table).update({ deleted_at: null }).eq('id', row.id)).then(({ error }) => {
            if (error) { console.error(error); toast('Не удалось вернуть — проверьте связь'); }
          });
        }
      } else {
        patch(step.table, step.id, step.prev as never);
      }
    }
    setToastMsg(null);
    // Например, вернуть на страницу восстановленного проекта — чтобы было видно, что отмена сработала.
    entry.onUndo?.();
    return true;
  }, [offline, patch, remove, setTable, toast, track]);

  const withUndo = useCallback((message: string, fn: () => void, onUndo?: () => void) => {
    recorder.current = [];
    try { fn(); } finally {
      const steps = recorder.current;
      recorder.current = null;
      if (steps.length) {
        undoStack.current.push({ message, steps, onUndo });
        if (undoStack.current.length > 20) undoStack.current.shift();
        toast(message, { label: 'Отменить', run: () => { undo(); } });
      }
    }
  }, [toast, undo]);

  const patchSettings = useCallback((changes: Partial<Settings>) => {
    const prev = dataRef.current.settings;
    setData((d) => ({ ...d, settings: { ...d.settings, ...changes } }));
    if (supabase && !offline) {
      track('settings', supabase.from('settings').update(changes).not('owner', 'is', null)).then(({ error }) => {
        if (error) {
          console.error(error);
          setData((d) => ({ ...d, settings: prev }));
          toast('Не сохранилось — проверьте связь');
        }
      });
    }
  }, [offline, toast, track]);

  const setRepeat = useCallback(async (taskId: string, r: RepeatInput) => {
    if (!supabase || offline) {
      setData((d) => generateLocal(setRuleLocal(d, taskId, r), todayISO()));
      return;
    }
    const { error } = await supabase.rpc('set_repeat', {
      p_task: taskId, p_kind: r.kind, p_every: r.every, p_unit: r.unit, p_weekdays: r.weekdays,
      p_month_day: r.month_day, p_start: r.start, p_end: r.end_date, p_today: todayISO(), p_habit: r.is_habit,
    });
    if (error) { console.error(error); toast('Повтор не сохранился — проверьте связь'); }
    await load();
  }, [offline, load, toast]);

  const stopRepeat = useCallback(async (taskId: string) => {
    if (!supabase || offline) {
      setData((d) => ({ ...d, rules: d.rules.filter((r) => r.task_id !== taskId),
        tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, is_template: false, is_habit: false } : t)) }));
      return;
    }
    const { error } = await supabase.rpc('stop_repeat', { p_task: taskId });
    if (error) { console.error(error); toast('Не получилось — проверьте связь'); }
    await load();
  }, [offline, load, toast]);

  const reload = useCallback(async () => {
    if (offline) { setData((d) => generateLocal(d, todayISO())); return; }
    await load();
  }, [offline, load]);

  const value = useMemo(() => ({ ...data, insert, patch, remove, withUndo, undo, toast, patchSettings, setRepeat, stopRepeat, reload }),
    [data, insert, patch, remove, withUndo, undo, toast, patchSettings, setRepeat, stopRepeat, reload]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          <span>{toastMsg.msg}</span>
          {toastMsg.action && (
            <button type="button" className="toast-action" onClick={toastMsg.action.run}>{toastMsg.action.label}</button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

const isHabitCopy = (r: Record<string, unknown>) => !!r.is_habit && !!r.repeat_template_id && !r.is_template;

/** Данные для расчётов роста: задачи вместе с удалёнными копиями привычек. */
export function useGrowthData() {
  const { tasks, projects, skills, habitGhosts } = useStore();
  return useMemo(() => ({ tasks: habitGhosts.length ? [...tasks, ...habitGhosts] : tasks, projects, skills }), [tasks, projects, skills, habitGhosts]);
}

/** Postgres numeric приходит строкой — приводим к числу. */
const NUMERIC: Partial<Record<TableName, string[]>> = {
  goals: ['start_value', 'target_value'], goal_steps: ['threshold'], goal_measurements: ['value'],
};
function num<T>(rows: T[] | null, keys: string[]): T[] | null {
  if (!rows || !keys.length) return rows;
  return rows.map((r) => {
    const o = { ...r } as Record<string, unknown>;
    for (const k of keys) if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]);
    return o as T;
  });
}

/** Хук «сегодня», который обновляется после полуночи. */
export function useToday() {
  const [t, setT] = useState(todayISO);
  useEffect(() => {
    const id = window.setInterval(() => setT(todayISO()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

/* ───────── Повторы без входа (только ?preview): тот же алгоритм, что в базе ───────── */

function setRuleLocal(d: Data, taskId: string, r: RepeatInput): Data {
  const rule: RepeatRule = {
    task_id: taskId, kind: r.kind, every: Math.max(r.every, 1), unit: r.unit, weekdays: r.weekdays, month_day: r.month_day,
    anchor_date: r.start, next_date: repeatFirst(r.kind, r.every, r.weekdays, r.month_day, r.start), end_date: r.end_date,
    is_habit: r.is_habit,
  };
  return {
    ...d,
    rules: [...d.rules.filter((x) => x.task_id !== taskId), rule],
    // Флажок привычки — у шаблона и у ещё не выполненных копий; выполненные не трогаем.
    tasks: d.tasks.map((t) => (t.id === taskId
      ? { ...t, is_template: true, is_habit: r.is_habit, when_date: null, someday: false, status: 'open', completed_at: null, logged_at: null }
      : t.repeat_template_id === taskId && t.status === 'open' ? { ...t, is_habit: r.is_habit } : t)),
  };
}

function generateLocal(d: Data, today: string): Data {
  let tasks = d.tasks;
  const rules = d.rules.map((r) => {
    if (!r.next_date || r.next_date > today) return r;
    const t = tasks.find((x) => x.id === r.task_id && x.is_template && !x.deleted_at);
    if (!t) return r;
    let nd = r.next_date;
    if (r.end_date && nd > r.end_date) return { ...r, next_date: null };
    if (r.kind !== 'after_completion') {
      for (;;) {
        const nx = repeatNext(r.kind, r.every, r.weekdays, r.month_day, r.anchor_date, nd);
        if (!nx || nx > today || (r.end_date && nx > r.end_date)) break;
        nd = nx;
      }
    }
    if (!tasks.some((x) => x.repeat_template_id === t.id && x.repeat_date === nd)) {
      tasks = [...tasks, { ...t, id: crypto.randomUUID(), is_template: false, when_date: nd, someday: false,
        status: 'open', completed_at: null, logged_at: null, deadline: null, today_order: Date.now() / 1000,
        repeat_template_id: t.id, repeat_date: nd, is_habit: r.is_habit, created_at: new Date().toISOString() }];
    }
    let next: string | null = r.kind === 'after_completion' ? null : repeatNext(r.kind, r.every, r.weekdays, r.month_day, r.anchor_date, nd);
    if (next && r.end_date && next > r.end_date) next = null;
    return { ...r, next_date: next };
  });
  return { ...d, rules, tasks };
}

/** «После выполнения» без входа: то, что в базе делает триггер. */
export function afterCompletionLocal(d: Data, copy: Task): Data {
  const r = d.rules.find((x) => x.task_id === copy.repeat_template_id);
  if (!r || r.kind !== 'after_completion') return d;
  const done = iso(new Date());
  const e = r.every;
  const nd = r.unit === 'week' ? addDays(done, 7 * e)
    : r.unit === 'month' ? (() => { const x = new Date(); x.setMonth(x.getMonth() + e); return iso(x); })()
    : addDays(done, e);
  return { ...d, rules: d.rules.map((x) => (x === r ? { ...x, next_date: r.end_date && nd > r.end_date ? null : nd } : x)) };
}
