import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useToday } from '../lib/store';
import { addDays, fmtMin, shortDate } from '../lib/dates';
import { skillOf } from '../lib/views';
import type { Task } from '../lib/types';
import { Icon, type IconName } from '../ui/icons';
import { useEditing } from './editing';
import { EstimatePicker, SkillGlyph, SkillPicker, WhenPicker } from './pickers';
import { MovePicker } from './actions';

type Kind = 'when' | 'est' | 'skill' | 'move';

/**
 * iPhone · Новая задача: карточка сверху экрана (радиус 24), внизу — «куда» (Входящие / проект / область) и «Сохранить».
 * Свойства — нижними листами. Пустая задача не создаётся.
 */
export function PhoneNewTask() {
  const store = useStore();
  const ed = useEditing();
  const today = useToday();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [pop, setPop] = useState<{ kind: Kind; anchor: HTMLElement } | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const f = (ed.draft?.fields ?? {}) as Partial<Task>;

  useEffect(() => { titleRef.current?.focus(); }, []);
  useLayoutEffect(() => {
    for (const el of [titleRef.current, notesRef.current]) {
      if (el) { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px'; }
    }
  }, [title, notes]);

  const save = () => ed.saveDraft(title, notes);
  const cancel = () => ed.saveDraft('', '');

  const where = f.project_id ? store.projects.find((p) => p.id === f.project_id)
    : f.area_id ? store.areas.find((a) => a.id === f.area_id) : null;
  const whereIcon: IconName = f.project_id ? 'project' : f.area_id ? 'area' : 'inbox';
  const whereLabel = where?.name || (f.project_id ? 'Новый проект' : f.area_id ? 'Новая область' : 'Входящие');
  const sk = skillOf(store, { skill_id: f.skill_id ?? null, project_id: f.project_id ?? null });

  const chips: { kind: Kind; node: React.ReactNode }[] = [];
  if (f.someday) chips.push({ kind: 'when', node: <><Icon name="someday" size={15} color="#3E423C" />Когда-нибудь</> });
  else if (f.when_date) {
    chips.push({
      kind: 'when',
      node: <><Icon name={f.when_date <= today ? 'today' : 'when'} size={15} color="#3E423C" />
        {f.when_date <= today ? (f.when_evening ? 'Сегодня вечером' : 'Сегодня') : f.when_date === addDays(today, 1) ? 'Завтра' : shortDate(f.when_date)}</>,
    });
  }
  if (f.estimate_min != null) chips.push({ kind: 'est', node: <><Icon name="estimate" size={15} color="#3E423C" />{fmtMin(f.estimate_min)}</> });
  if (sk.skill) chips.push({ kind: 'skill', node: <><SkillGlyph skill={sk.skill} size={15} color="#3D6A00" />{sk.skill.name}{sk.inherited && <span className="sub"> · из проекта</span>}</> });

  const buttons: { kind: Kind; icon: IconName; label: string }[] = [];
  if (!f.when_date && !f.someday) buttons.push({ kind: 'when', icon: 'when', label: 'Когда' });
  if (f.estimate_min == null) buttons.push({ kind: 'est', icon: 'estimate', label: 'Оценка' });
  if (!sk.skill) buttons.push({ kind: 'skill', icon: 'skill', label: 'Навык' });
  const open = (kind: Kind) => (e: React.MouseEvent<HTMLElement>) => setPop({ kind, anchor: e.currentTarget });

  return createPortal(
    <div className="pnew-scrim" data-keep-card onClick={() => (title.trim() || notes.trim() ? save() : cancel())}>
      <div className="pnew" role="dialog" aria-label="Новая задача" onClick={(e) => e.stopPropagation()}>
        <div className="pnew-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span className="cb cb-phone" aria-hidden="true" style={{ marginTop: 2 }} />
            <textarea ref={titleRef} className="pnew-title" rows={1} value={title} placeholder="Новая задача" aria-label="Название задачи"
              enterKeyHint="done" onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }} />
            <button type="button" className="pnew-x" aria-label="Закрыть без сохранения" onClick={cancel}>
              <Icon name="clear" size={16} color="#3E423C" width={2.2} />
            </button>
          </div>
          <textarea ref={notesRef} className="pnew-notes" rows={1} value={notes} placeholder="Заметки" aria-label="Заметки"
            onChange={(e) => setNotes(e.target.value)} />
          <div className="pnew-props">
            <div className="card-chips">
              {chips.map((c) => (
                <button key={c.kind} type="button" className={'prop-chip' + (c.kind === 'skill' ? ' skill' : '')} onClick={open(c.kind)}>{c.node}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {buttons.map((b) => (
                <button key={b.kind} type="button" className="pnew-btn" aria-label={b.label} onClick={open(b.kind)}>
                  <Icon name={b.icon} size={22} color="#3E423C" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="pnew-foot">
          <button type="button" className="pnew-where" onClick={open('move')} aria-label={`Куда: ${whereLabel}`}>
            <Icon name={whereIcon} size={20} color="#3E423C" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{whereLabel}</span>
            <Icon name="chevronDown" size={14} color="#5F635C" width={2.2} />
          </button>
          <button type="button" className="btn-lime pnew-save" onClick={save}>Сохранить</button>
        </div>
      </div>

      {pop?.kind === 'when' && (
        <WhenPicker anchor={pop.anchor} onClose={() => setPop(null)} onPick={(v) => ed.patchDraft(v)}
          value={{ when_date: f.when_date ?? null, when_evening: !!f.when_evening, someday: !!f.someday }} />
      )}
      {pop?.kind === 'est' && (
        <EstimatePicker anchor={pop.anchor} onClose={() => setPop(null)} value={f.estimate_min ?? null}
          onPick={(v) => ed.patchDraft({ estimate_min: v })} />
      )}
      {pop?.kind === 'skill' && (
        <SkillPicker anchor={pop.anchor} onClose={() => setPop(null)} value={f.skill_id ?? null}
          inherited={skillOf(store, { skill_id: null, project_id: f.project_id ?? null }).skill}
          onPick={(id) => ed.patchDraft({ skill_id: id })} />
      )}
      {pop?.kind === 'move' && (
        <MovePicker anchor={pop.anchor} onClose={() => setPop(null)}
          task={{ project_id: f.project_id ?? null, area_id: f.area_id ?? null }} onPick={(to) => ed.patchDraft(to)} />
      )}
    </div>,
    document.body,
  );
}
