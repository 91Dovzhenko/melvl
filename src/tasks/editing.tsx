import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { orderAfter } from '../lib/views';
import type { Task } from '../lib/types';

/** Контекст текущего раздела: что получает новая задача и в каком списке она встаёт. */
export type NewTaskContext = {
  defaults: Partial<Task>;
  list: Task[];
  /** В «Сегодня» новая задача встаёт в группу выделенной (тот же проект/область/вечер). */
  inheritFromSelected?: (keyof Task)[];
  orderKey?: 'sort_order' | 'today_order';
  /** Своё действие для «+» / ⌘N (в области — новый проект). */
  onNew?: () => void;
};

export type Draft = { afterId: string | null; fields: Partial<Task> };

type Editing = {
  selectedId: string | null;
  editingId: string | null;
  draft: Draft | null;
  select: (id: string | null) => void;
  open: (id: string) => void;
  close: () => void;
  requestNew: () => void;
  saveDraft: (title: string, notes: string) => void;
  register: (ctx: NewTaskContext | null) => void;
};

const Ctx = createContext<Editing | null>(null);
export const useEditing = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('EditingProvider missing');
  return c;
};

export function EditingProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [selectedId, setSelected] = useState<string | null>(null);
  const [editingId, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const ctxRef = useRef<NewTaskContext | null>(null);

  const register = useCallback((ctx: NewTaskContext | null) => { ctxRef.current = ctx; }, []);

  const requestNew = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.onNew) { ctx.onNew(); return; }
    const sel = ctx.list.find((t) => t.id === selectedId);
    const fields: Partial<Task> = { ...ctx.defaults };
    if (sel) for (const k of ctx.inheritFromSelected ?? []) (fields as Record<string, unknown>)[k] = sel[k];
    fields.sort_order = orderAfter(ctx.list, sel, 'sort_order');
    fields.today_order = orderAfter(ctx.list, sel, 'today_order');
    setEditing(null);
    setDraft({ afterId: sel?.id ?? null, fields });
  }, [selectedId]);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { insert } = store;
  const saveDraft = useCallback((title: string, notes: string) => {
    const d = draftRef.current;
    if (!d) return;
    draftRef.current = null;
    setDraft(null);
    // Пустая новая задача при закрытии не создаётся.
    if (title.trim() || notes.trim()) {
      const t = insert('tasks', { ...d.fields, title: title.trim(), notes });
      setSelected(t.id);
    }
  }, [insert]);

  const value = useMemo<Editing>(() => ({
    selectedId, editingId, draft,
    select: (id) => setSelected(id),
    open: (id) => { setDraft(null); setSelected(id); setEditing(id); },
    close: () => setEditing(null),
    requestNew, saveDraft, register,
  }), [selectedId, editingId, draft, requestNew, saveDraft, register]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Раздел сообщает, куда и с чем создавать новую задачу. */
export function useNewTaskContext(ctx: NewTaskContext) {
  const { register } = useEditing();
  useEffect(() => { register(ctx); });
  useEffect(() => () => register(null), [register]);
}
