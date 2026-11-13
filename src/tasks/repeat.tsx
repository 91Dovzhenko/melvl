import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useToday } from '../lib/store';
import { addDays, parseISO, shortDate } from '../lib/dates';
import { describe, upcoming, type RepeatKind, type RepeatRule, type RepeatUnit } from '../lib/repeat';
import type { Task } from '../lib/types';
import { Icon } from '../ui/icons';
import { Pop, PopItem } from '../ui/Pop';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { useIsPhone } from '../ui/useIsPhone';

const TABS: { kind: RepeatKind; label: string; short: string }[] = [
  { kind: 'after_completion', label: 'После выполнения', short: 'После' },
  { kind: 'daily', label: 'По дням', short: 'Дни' },
  { kind: 'weekly', label: 'По неделям', short: 'Недели' },
  { kind: 'monthly', label: 'По месяцам', short: 'Месяцы' },
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
  const [habit, setHabit] = useState<boolean>(rule?.is_habit ?? false);
  const [busy, setBusy] = useState(false);
  const phone = useIsPhone();

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
    await store.setRepeat(target.id, { ...draft, start, is_habit: habit });
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

  const chev = <Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />;
  const chevRight = <Icon name="chevronRight" size={16} color="#8E9289" width={2} />;
  const numInput = (label: string) => (
    <input className="rep-num" inputMode="numeric" value={every} aria-label={label} onChange={(e) => setEvery(e.target.value.replace(/\D/g, ''))} />
  );
  // Общий выпадающий список (Спецификация, раздел 12) — единица и число месяца.
  const unitDrop = <Select compact={!phone} label="Единица" value={unit} width={phone ? 140 : 130} onChange={setUnit} options={UNITS} />;
  const mdayDrop = (
    <Select compact={!phone} label="Число месяца" value={String(monthDay)} width={phone ? 150 : 140} onChange={(v) => setMonthDay(Number(v))}
      options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}-го числа` }))} />
  );
  const days = kind === 'weekly' && (
    <div className="rep-days">
      {WD.map((w, i) => {
        const on = weekdays.includes(i + 1);
        return (
          <button key={w} type="button" aria-pressed={on} className={'rep-day' + (on ? ' on' : '')}
            onClick={() => setWeekdays((cur) => (on ? cur.filter((x) => x !== i + 1) : [...cur, i + 1]))}>{w}</button>
        );
      })}
    </div>
  );
  const tabs = (
    <div role="tablist" aria-label="Тип повтора" className="set-seg rep-tabs">
      {TABS.map((t) => (
        <button key={t.kind} type="button" role="tab" aria-selected={kind === t.kind} aria-checked={kind === t.kind}
          aria-label={t.label} onClick={() => setKind(t.kind)}>{phone ? t.short : t.label}</button>
      ))}
    </div>
  );
  const copyNote = tpl && task.repeat_template_id && (
    <p className="set-sub" style={{ margin: 0 }}>Это копия повторяющейся задачи. Изменения правила относятся к будущим копиям.</p>
  );
  const habitRow = (
    <div className="rep-habit">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span id="rep-habit-label" className="rep-habit-t">Это привычка</span>
        <span className="rep-habit-s">Учитывается в привычках в сводке главы</span>
      </div>
      <button type="button" role="switch" aria-checked={habit} aria-labelledby="rep-habit-label"
        className={'switch' + (habit ? ' on' : '')} onClick={() => setHabit((h) => !h)}><span /></button>
    </div>
  );
  const pops = (
    <>
      {(pop?.kind === 'start' || pop?.kind === 'endDate') && (
        <DatePicker anchor={pop.anchor} onClose={() => setPop(null)} title={pop.kind === 'start' ? (kind === 'after_completion' ? 'Первый раз' : 'Следующий раз') : 'Окончание'}
          value={pop.kind === 'start' ? start : end ?? start}
          onPick={(d) => { if (!d) return; if (pop.kind === 'start') setStart(d); else setEnd(d); }} />
      )}
      {pop?.kind === 'end' && (
        <Pop anchor={pop.anchor} onClose={() => setPop(null)} variant="light" width={200} title="Окончание">
          <PopItem label="Никогда" selected={!end} onClick={() => { setEnd(null); setPop(null); }} />
          <PopItem label="Выбрать дату…" selected={!!end} onClick={(() => { const a = pop.anchor; return () => setPop({ kind: 'endDate', anchor: a }); })()} />
        </Pop>
      )}
    </>
  );
  const startCap = kind === 'after_completion' ? 'Первый раз' : 'Следующий раз';
  const endLabel = end ? shortDate(end) : 'никогда';
  const hintText = valid ? hint : 'Выберите хотя бы один день недели';

  /* iPhone · белый лист-форма (раздел 9 спецификации): шапка «Отменить · Повторять · Готово». */
  if (phone) {
    return createPortal(
      <div className="rep-sheet-scrim" data-keep-card onClick={onClose}>
        <div className="rep-sheet" role="dialog" aria-modal="true" aria-labelledby="rep-title" onClick={(e) => e.stopPropagation()}>
          <span className="rep-grip" aria-hidden="true" />
          <div className="rep-head">
            <button type="button" className="rep-cancel" onClick={onClose}>Отменить</button>
            <h2 id="rep-title"><Icon name="repeat" size={18} width={1.9} />Повторять</h2>
            <button type="button" className="rep-done" disabled={!valid || busy} onClick={save}>Готово</button>
          </div>
          {copyNote}
          {tabs}
          <div className="rep-box">
            <div className="rep-line">
              {kind === 'after_completion'
                ? <><span className="rep-cap-p">Через</span>{numInput('Сколько')}{unitDrop}<span>после выполнения</span></>
                : <><span className="rep-cap-p">Раз в</span>{numInput('Интервал')}
                  <span>{kind === 'daily' ? 'дн.' : kind === 'weekly' ? 'нед. в' : 'мес.'}</span>{kind === 'monthly' && mdayDrop}</>}
            </div>
            {days}
            <button type="button" className="rep-row" onClick={(e) => setPop({ kind: 'start', anchor: e.currentTarget })}>
              <span className="rep-cap-p" style={{ flex: 1 }}>{startCap}</span><span>{startLabel}</span>{chevRight}
            </button>
            <button type="button" className="rep-row" onClick={(e) => setPop({ kind: 'end', anchor: e.currentTarget })}>
              <span className="rep-cap-p" style={{ flex: 1 }}>Окончание</span><span>{endLabel}</span>{chevRight}
            </button>
          </div>
          <span className="rep-hint-p">{hintText}</span>
          {habitRow}
          {rule && <button type="button" className="btn-text rep-stop" disabled={busy} onClick={stop}>Остановить повтор</button>}
        </div>
        {pops}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="modal-scrim" data-keep-card onClick={onClose}>
      <div className="modal rep" role="dialog" aria-modal="true" aria-labelledby="rep-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="repeat" size={20} width={1.9} />
          <h2 id="rep-title">Повторять</h2>
        </div>
        {copyNote}
        {tabs}

        <div className="rep-box">
          {kind === 'after_completion' && (
            <div className="rep-line"><span>Через</span>{numInput('Сколько')}{unitDrop}<span>после выполнения</span></div>
          )}
          {kind !== 'after_completion' && (
            <div className="rep-line">
              <span className="rep-cap">Раз в</span>{numInput('Интервал')}
              <span>{kind === 'daily' ? 'дн.' : kind === 'weekly' ? 'нед. в' : 'мес.'}</span>
              {kind === 'monthly' && mdayDrop}
            </div>
          )}
          {days}
          <div className="rep-line ruled">
            <span className="rep-cap">{startCap}</span>
            <button type="button" className="rep-drop" onClick={(e) => setPop({ kind: 'start', anchor: e.currentTarget })}>{startLabel}{chev}</button>
          </div>
          <div className="rep-line ruled">
            <span className="rep-cap">Окончание</span>
            <Select compact label="Окончание" value={end ? 'date' : 'never'} width={140}
              onChange={(v) => setEnd(v === 'never' ? null : end ?? addDays(start, 30))}
              options={[{ value: 'never', label: 'никогда' }, { value: 'date', label: 'в дату' }]} />
            {end && <button type="button" className="rep-drop" onClick={(e) => setPop({ kind: 'endDate', anchor: e.currentTarget })}>{endLabel}{chev}</button>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#5F635C' }}>
          <Icon name="when" size={15} color="#8E9289" />
          <span>{hintText}</span>
        </div>
        {habitRow}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {rule ? <button type="button" className="btn-text" style={{ padding: '0 8px' }} disabled={busy} onClick={stop}>Остановить повтор</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-quiet" style={{ height: 40, padding: '0 18px' }} onClick={onClose}>Отменить</button>
            <button type="button" className="btn-lime" style={{ height: 40, padding: '0 22px' }} disabled={!valid || busy} onClick={save}>Готово</button>
          </div>
        </div>
        {pops}
      </div>
    </div>,
    document.body,
  );
}
