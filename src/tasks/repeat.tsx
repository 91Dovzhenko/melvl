import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useToday } from '../lib/store';
import { addDays, parseISO, shortDate } from '../lib/dates';
import { describe, upcoming, type RepeatKind, type RepeatRule, type RepeatUnit } from '../lib/repeat';
import type { Task } from '../lib/types';
import { Icon } from '../ui/icons';
import { Pop, PopItem } from '../ui/Pop';
import { WhenPicker } from './pickers';

const TABS: { kind: RepeatKind; label: string }[] = [
  { kind: 'after_completion', label: 'После выполнения' },
  { kind: 'daily', label: 'По дням' },
  { kind: 'weekly', label: 'По неделям' },
  { kind: 'monthly', label: 'По месяцам' },
];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const UNITS: { value: RepeatUnit; label: string }[] = [{ value: 'day', label: 'день' }, { value: 'week', label: 'неделю' }, { value: 'month', label: 'месяц' }];
const isoDow = (d: string) => ((parseISO(d).getDay() + 6) % 7) + 1;
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** Шаблон для задачи: сама задача, если это шаблон; шаблон копии; иначе — она станет шаблоном. */
export function templateOf(tasks: Task[], t: Task) {
  if (t.is_template) return t;
  if (t.repeat_template_id) return tasks.find((x) => x.id === t.repeat_template_id && !x.deleted_at) ?? null;
  return null;
}

/**
 * Окно «Повторять» (экран «Повтор — 4 типа»): модальное 560; на iPhone — у низа экрана.
 * Если у задачи уже есть дата, она становится первой датой повтора.
 */
export function RepeatDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const store = useStore();
  const today = useToday();
  const tpl = templateOf(store.tasks, task);
  const target = tpl ?? task;
  const rule = store.rules.find((r) => r.task_id === target.id);
  const start0 = rule?.next_date ?? (task.when_date && task.when_date > today ? task.when_date : task.when_date ?? today);

  const [kind, setKind] = useState<RepeatKind>(rule?.kind ?? 'weekly');
  const [every, setEvery] = useState(String(rule?.every ?? 1));
  const [unit, setUnit] = useState<RepeatUnit>(rule?.unit ?? 'week');
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays?.length ? rule.weekdays : [isoDow(start0)]);
  const [monthDay, setMonthDay] = useState<number>(rule?.month_day ?? parseISO(start0).getDate());
  const [start, setStart] = useState(start0 < today ? today : start0);
  const [end, setEnd] = useState<string | null>(rule?.end_date ?? null);
  const [pop, setPop] = useState<{ kind: 'unit' | 'start' | 'end' | 'endDate' | 'mday'; anchor: HTMLElement } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pop) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, pop]);

  const n = Math.max(1, Math.min(99, parseInt(every, 10) || 1));
  const draft: Pick<RepeatRule, 'kind' | 'every' | 'unit' | 'weekdays' | 'month_day' | 'end_date'> = {
    kind, every: n, unit: kind === 'after_completion' ? unit : null,
    weekdays: kind === 'weekly' ? [...weekdays].sort() : null,
    month_day: kind === 'monthly' ? monthDay : null, end_date: end,
  };
  const dates = upcoming(draft, start, 4);
  const valid = kind !== 'weekly' || weekdays.length > 0;
  const hint = kind === 'after_completion'
    ? `Новая копия появится через ${describe(draft).replace(/^Через /, '').replace(/ после выполнения$/, '')} после того, как отметите задачу`
    : dates.length ? `Ближайшие: ${dates.map(dm).join(', ')}${dates.length === 4 ? '…' : ''}` : 'Ближайших дат нет — проверьте окончание';

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    await store.setRepeat(target.id, { ...draft, start });
    setBusy(false);
    onClose();
  };
  const stop = async () => {
    setBusy(true);
    await store.stopRepeat(target.id);
    setBusy(false);
    onClose();
  };
  const startLabel = start === today ? `Сегодня, ${shortDate(start)}` : start === addDays(today, 1) ? `Завтра, ${shortDate(start)}` : shortDate(start);

  return createPortal(
    <div className="modal-scrim" data-keep-card onClick={onClose}>
      <div className="modal rep" role="dialog" aria-modal="true" aria-labelledby="rep-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="repeat" size={20} width={1.9} />
          <h2 id="rep-title">Повторять</h2>
        </div>
        {tpl && task.repeat_template_id && (
          <p className="set-sub" style={{ margin: 0 }}>Это копия повторяющейся задачи. Изменения правила относятся к будущим копиям.</p>
        )}
        <div role="tablist" aria-label="Тип повтора" className="set-seg rep-tabs">
          {TABS.map((t) => (
            <button key={t.kind} type="button" role="tab" aria-selected={kind === t.kind} aria-checked={kind === t.kind}
              onClick={() => setKind(t.kind)}>{t.label}</button>
          ))}
        </div>

        <div className="rep-box">
          {kind === 'after_completion' && (
            <div className="rep-line">
              <span>Через</span>
              <input className="rep-num" inputMode="numeric" value={every} aria-label="Сколько" onChange={(e) => setEvery(e.target.value.replace(/\D/g, ''))} />
              <button type="button" className="rep-drop" onClick={(e) => setPop({ kind: 'unit', anchor: e.currentTarget })}>
                {UNITS.find((u) => u.value === unit)!.label}<Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
              </button>
              <span>после выполнения</span>
            </div>
          )}
          {kind !== 'after_completion' && (
            <div className="rep-line">
              <span className="rep-cap">Раз в</span>
              <input className="rep-num" inputMode="numeric" value={every} aria-label="Интервал" onChange={(e) => setEvery(e.target.value.replace(/\D/g, ''))} />
              <span>{kind === 'daily' ? 'дн.' : kind === 'weekly' ? 'нед. в' : 'мес.'}</span>
              {kind === 'monthly' && (
                <button type="button" className="rep-drop" onClick={(e) => setPop({ kind: 'mday', anchor: e.currentTarget })}>
                  {monthDay}-го числа<Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
                </button>
              )}
            </div>
          )}
          {kind === 'weekly' && (
            <div className="rep-days">
              {WD.map((w, i) => {
                const on = weekdays.includes(i + 1);
                return (
                  <button key={w} type="button" aria-pressed={on} className={'rep-day' + (on ? ' on' : '')}
                    onClick={() => setWeekdays((cur) => (on ? cur.filter((x) => x !== i + 1) : [...cur, i + 1]))}>{w}</button>
                );
              })}
            </div>
          )}
          <div className="rep-line ruled">
            <span className="rep-cap">{kind === 'after_completion' ? 'Первый раз' : 'Следующий раз'}</span>
            <button type="button" className="rep-drop" onClick={(e) => setPop({ kind: 'start', anchor: e.currentTarget })}>
              {startLabel}<Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
            </button>
          </div>
          <div className="rep-line ruled">
            <span className="rep-cap">Окончание</span>
            <button type="button" className="rep-drop" onClick={(e) => setPop({ kind: 'end', anchor: e.currentTarget })}>
              {end ? shortDate(end) : 'никогда'}<Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#5F635C' }}>
          <Icon name="when" size={15} color="#8E9289" />
          <span>{valid ? hint : 'Выберите хотя бы один день недели'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {rule ? <button type="button" className="btn-text" style={{ padding: '0 8px' }} disabled={busy} onClick={stop}>Остановить повтор</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-quiet" style={{ height: 40, padding: '0 18px' }} onClick={onClose}>Отменить</button>
            <button type="button" className="btn-lime" style={{ height: 40, padding: '0 22px' }} disabled={!valid || busy} onClick={save}>Готово</button>
          </div>
        </div>

        {pop?.kind === 'unit' && (
          <Pop anchor={pop.anchor} onClose={() => setPop(null)} variant="light" width={180} title="Единица">
            {UNITS.map((u) => <PopItem key={u.value} label={u.label} selected={u.value === unit} onClick={() => { setUnit(u.value); setPop(null); }} />)}
          </Pop>
        )}
        {pop?.kind === 'mday' && (
          <Pop anchor={pop.anchor} onClose={() => setPop(null)} variant="light" width={240} title="Число месяца">
            <div className="mday-grid">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button key={d} type="button" className={'mday' + (d === monthDay ? ' on' : '')} onClick={() => { setMonthDay(d); setPop(null); }}>{d}</button>
              ))}
            </div>
          </Pop>
        )}
        {(pop?.kind === 'start' || pop?.kind === 'endDate') && (
          <WhenPicker anchor={pop.anchor} onClose={() => setPop(null)} dateOnly
            value={{ when_date: pop.kind === 'start' ? start : end, when_evening: false, someday: false }}
            onPick={(v) => { if (!v.when_date) return; if (pop.kind === 'start') setStart(v.when_date); else setEnd(v.when_date); }} />
        )}
        {pop?.kind === 'end' && (
          <Pop anchor={pop.anchor} onClose={() => setPop(null)} variant="light" width={200} title="Окончание">
            <PopItem label="Никогда" selected={!end} onClick={() => { setEnd(null); setPop(null); }} />
            <PopItem label="Выбрать дату…" selected={!!end} onClick={(() => { const a = pop.anchor; return () => setPop({ kind: 'endDate', anchor: a }); })()} />
          </Pop>
        )}
      </div>
    </div>,
    document.body,
  );
}
