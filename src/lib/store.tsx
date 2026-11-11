import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { todayISO } from './dates';
import type { Area, Project, Settings, Skill, TableName, Tables, Task } from './types';

export type Data = {
  areas: Area[]; projects: Project[]; tasks: Task[]; skills: Skill[];
  settings: Settings;
  loading: boolean;
};

type Store = Data & {
  insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Tables[T];
  patch<T extends TableName>(table: T, id: string, changes: Partial<Tables[T]>): void;
  remove(table: TableName, id: string): void;
  toast: (msg: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store not mounted');
  return s;
}

const DEFAULT_SETTINGS: Settings = { log_mode: 'manual', today_view: 'projects', last_auto_log: null };

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
    logged_at: null, today_order: Date.now() / 1000, repeat_template_id: null, repeat_date: null, created_at: now(), ...row,
  } as Tables[T];
  return { ...base, name: '', branch: 'creator', icon: '', active: true, ...row } as Tables[T];
}

/**
 * Данные в памяти + запись в Supabase.
 * Правка применяется сразу; при ошибке сервера — откат и тихое сообщение.
 * `offline` — локальный просмотр без входа (только dev, ?preview): в базу ничего не пишется.
 */
export function StoreProvider({ children, offline, seed }: { children: React.ReactNode; offline?: boolean; seed?: Partial<Data> }) {
  const [data, setData] = useState<Data>({
    areas: [], projects: [], tasks: [], skills: [], settings: DEFAULT_SETTINGS, loading: !offline, ...seed,
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const dataRef = useRef(data);
  dataRef.current = data;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!supabase || offline) return;
    const init = await supabase.rpc('init_user');
    const [a, p, t, s, st] = await Promise.all([
      supabase.from('areas').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('projects').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('tasks').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('skills').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('settings').select('log_mode,today_view,last_auto_log').maybeSingle(),
    ]);
    const err = init.error || a.error || p.error || t.error || s.error || st.error;
    if (err) { toast('Не удалось загрузить данные'); console.error(err); }
    setData((d) => ({
      areas: (a.data as Area[]) ?? d.areas,
      projects: (p.data as Project[]) ?? d.projects,
      tasks: (t.data as Task[]) ?? d.tasks,
      skills: (s.data as Skill[]) ?? d.skills,
      settings: (st.data as Settings) ?? d.settings,
      loading: false,
    }));
  }, [offline, toast]);

  useEffect(() => { void load(); }, [load]);

  // До Realtime (п. 7 сборки): подтягиваем свежие данные, когда приложение снова на экране.
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [load]);

  const setTable = useCallback(<T extends TableName>(table: T, fn: (rows: Tables[T][]) => Tables[T][]) => {
    setData((d) => ({ ...d, [table]: fn(d[table] as Tables[T][]) }));
  }, []);

  const insert = useCallback(<T extends TableName>(table: T, row: Partial<Tables[T]>) => {
    const full = defaults(table, row);
    setTable(table, (rows) => [...rows, full]);
    if (supabase && !offline) {
      const payload = { ...full } as Record<string, unknown>;
      delete payload.created_at;
      supabase.from(table).insert(payload).then(({ error }) => {
        if (error) {
          console.error(error);
          setTable(table, (rows) => rows.filter((r) => r.id !== full.id));
          toast('Не сохранилось — проверьте связь');
        }
      });
    }
    return full;
  }, [offline, setTable, toast]);

  const patch = useCallback(<T extends TableName>(table: T, id: string, changes: Partial<Tables[T]>) => {
    const prev = (dataRef.current[table] as Tables[T][]).find((r) => r.id === id);
    if (!prev) return;
    setTable(table, (rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    if (supabase && !offline) {
      supabase.from(table).update(changes as Record<string, unknown>).eq('id', id).then(({ error }) => {
        if (error) {
          console.error(error);
          setTable(table, (rows) => rows.map((r) => (r.id === id ? prev : r)));
          toast('Не сохранилось — проверьте связь');
        }
      });
    }
  }, [offline, setTable, toast]);

  /** Мягкое удаление: строка пропадает из интерфейса, в базе — пометка deleted_at. */
  const remove = useCallback((table: TableName, id: string) => {
    const prev = (dataRef.current[table] as { id: string }[]).find((r) => r.id === id);
    if (!prev) return;
    setTable(table, (rows) => rows.filter((r) => r.id !== id));
    if (supabase && !offline) {
      supabase.from(table).update({ deleted_at: now() }).eq('id', id).then(({ error }) => {
        if (error) {
          console.error(error);
          setTable(table, (rows) => [...rows, prev as never]);
          toast('Не удалилось — проверьте связь');
        }
      });
    }
  }, [offline, setTable, toast]);

  const value = useMemo(() => ({ ...data, insert, patch, remove, toast }), [data, insert, patch, remove, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
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
