// «Сводка» на Mac (21_ТЗ, 4.3 и 5.3; спецификация «Время», раздел 8): несколько таблиц недели друг под другом.
import { useState } from 'react';
import { useStore } from '../../lib/store';
import { Icon } from '../../ui/icons';
import { DatePicker } from '../../ui/DatePicker';
import { Pop, type Anchor } from '../../ui/Pop';
import { useIsPhone } from '../../ui/useIsPhone';
import { dayAdd, weekStartOf } from '../../lib/time/clock';
import { fmtHM, fmtSigned, monthName } from '../../lib/time/format';
import { colorHex } from '../../lib/time/palette';
import { isWorkday, toggleDay } from '../../lib/time/schedule';
import { weekSummary, type Summary } from '../../lib/time/summary';
import type { SummaryTable, TimeCategory, TimeDirection } from '../../lib/time/types';
import { useMskNow } from './useTime';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const byOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;
const sameTable = (a: SummaryTable, b: SummaryTable) => a.kind === b.kind && a.id === b.id;

/** «9–15 ноября», «30 ноября – 6 декабря», другой год — с годом. */
export function weekTitle(monday: string, today: string, short = false) {
  const MONTHS_GEN = short ? MONTHS_SHORT : MONTHS_FULL;
  const sun = dayAdd(monday, 6);
  const [y1, m1, d1] = monday.split('-').map(Number);
  const [y2, m2, d2] = sun.split('-').map(Number);
  const year = y2 !== Number(today.slice(0, 4)) ? ` ${y2}` : '';
  if (m1 === m2) return `${d1}–${d2} ${MONTHS_GEN[m2 - 1]}${year}`;
  return `${d1} ${MONTHS_GEN[m1 - 1]}${y1 !== y2 ? ` ${y1}` : ''} – ${d2} ${MONTHS_GEN[m2 - 1]}${year}`;
}

export const normText = (d: TimeDirection) =>
  d.norm_type === 'daily' ? `норма ${fmtHM(d.norm_min)} в рабочий день` : d.norm_type === 'monthly' ? `норма ${fmtHM(d.norm_min)} в месяц` : 'без нормы';

/** Выбранные таблицы: из настроек (без удалённых); выбора ещё нет — направления с нормой, иначе первая категория. */
export function useSummaryTables() {
  const store = useStore();
  const cats = store.time_categories.filter((c) => !c.deleted_at).sort(byOrder);
  const dirs = store.time_directions.filter((d) => !d.deleted_at).sort(byOrder);
  const exists = (t: SummaryTable) => (t.kind === 'category' ? cats.some((c) => c.id === t.id) : dirs.some((d) => d.id === t.id));
  const saved = store.settings.time_summary_tables;
  const tables: SummaryTable[] = saved
    ? saved.filter(exists)
    : (() => {
      const normed = cats.flatMap((c) => dirs.filter((d) => d.category_id === c.id && d.norm_type !== 'none' && d.status === 'active'))
        .map((d) => ({ kind: 'direction' as const, id: d.id }));
      return normed.length ? normed : cats.slice(0, 1).map((c) => ({ kind: 'category' as const, id: c.id }));
    })();
  const toggle = (t: SummaryTable) => {
    const next = tables.some((x) => sameTable(x, t)) ? tables.filter((x) => !sameTable(x, t)) : [...tables, t];
    store.patchSettings({ time_summary_tables: next });
  };
  return { tables, toggle, cats, dirs };
}

export function SummaryView() {
  const store = useStore();
  const now = useMskNow();
  const phone = useIsPhone();
  const [week, setWeek] = useState(() => weekStartOf(now.date));
  const [pick, setPick] = useState<Anchor | null>(null);
  const [cal, setCal] = useState<Anchor | null>(null);
  const { tables, toggle, cats, dirs } = useSummaryTables();
  const curWeek = weekStartOf(now.date);

  return (
    <>
      <div className={'day-bar' + (phone ? ' ph' : '')}>
        <button type="button" className={'tsum-picker' + (pick ? ' open' : '')} aria-haspopup="menu" aria-expanded={!!pick}
          onClick={(e) => setPick(pick ? null : e.currentTarget)}>
          Таблицы · {tables.length}<Icon name="chevronDown" size={12} color="#5F635C" width={2.2} />
        </button>
        <span className="day-title">{weekTitle(week, now.date, phone)}</span>
        <button type="button" className="day-nav" aria-label="Предыдущая неделя" onClick={() => setWeek((w) => dayAdd(w, -7))}><Icon name="back" size={14} width={2.2} /></button>
        <button type="button" className="day-nav" aria-label="Следующая неделя" onClick={() => setWeek((w) => dayAdd(w, 7))}><Icon name="chevronRight" size={14} width={2.2} /></button>
        {!phone && <button type="button" className="day-nav" aria-label="Выбрать неделю" onClick={(e) => setCal(e.currentTarget)}><Icon name="when" size={15} width={1.9} /></button>}
        {(!phone || week !== curWeek) && <button type="button" className={'day-today' + (week === curWeek ? '' : ' away')} onClick={() => setWeek(curWeek)}>{phone ? 'Сейчас' : 'Эта неделя'}</button>}
      </div>
      {cal && <DatePicker value={week} anchor={cal} title="Неделя" onClose={() => setCal(null)} onPick={(d) => { if (d) setWeek(weekStartOf(d)); }} />}
      {pick && <TablesMenu anchor={pick} onClose={() => setPick(null)} tables={tables} toggle={toggle} cats={cats} dirs={dirs} />}

      {tables.length === 0 ? (
        <div className="tset-empty">
          <span style={{ fontSize: 16, fontWeight: 800 }}>Таблицы не выбраны</span>
          <span className="set-sub">Выбери направления или категории в «Таблицы ▾».</span>
        </div>
      ) : (
        <div className="tsum-tables">
          {tables.map((t) => {
            const dir = t.kind === 'direction' ? dirs.find((d) => d.id === t.id)! : null;
            const cat = (dir ? cats.find((c) => c.id === dir.category_id) : cats.find((c) => c.id === t.id))!;
            const s = weekSummary({ slots: store.time_slots, table: t, weekStart: week, now, direction: dir, schedules: store.time_week_schedules });
            return phone
              ? <PhoneTable key={t.kind + t.id} s={s} dir={dir} cat={cat} week={week} />
              : <SumTable key={t.kind + t.id} s={s} dir={dir} cat={cat} week={week} />;
          })}
          <p className="tsum-note">
            {phone ? 'Точка — рабочий день, тап по дате ставит или снимает его. * «К прошлой» — до этого же момента прошлой недели.' : <>
              Точка под датой — рабочий день; клик по дате ставит или снимает его (только у направлений с нормой «в рабочий день»).
              План — норма × рабочие дни; «Среднее» — за рабочий день, у остальных — за день. * «К прошлой» — с понедельника до этого же момента прошлой недели.</>}
          </p>
        </div>
      )}
    </>
  );
}

/** Клик по дате у направления с нормой «в рабочий день»: своя строка недели (копия унаследованной маски) с переключённым днём. */
export function useToggleWorkday() {
  const store = useStore();
  return (dir: TimeDirection, week: string, s: Summary, i: number) => {
    if (dir.norm_type !== 'daily' || !s.mask) return;
    const next = toggleDay(s.mask.mask, i);
    const own = store.time_week_schedules.find((w) => w.direction_id === dir.id && w.week_start === week);
    const on = isWorkday(next, i);
    store.withUndo(`${WD[i]} — ${on ? 'рабочий день' : 'выходной'} · ${dir.name}`, () => {
      if (own) store.patch('time_week_schedules', own.id, { days: next });
      else store.insert('time_week_schedules', { direction_id: dir.id, week_start: week, days: next });
    });
  };
}

function TableTitle({ s, dir, cat }: { s: Summary; dir: TimeDirection | null; cat: TimeCategory }) {
  const phone = useIsPhone();
  if (phone) {
    const norm = dir ? (dir.norm_type === 'daily' ? `${fmtHM(dir.norm_min)} в раб. день` : dir.norm_type === 'monthly' ? `${fmtHM(dir.norm_min)} в месяц` : 'без нормы') : 'вся категория';
    return (
      <div className="tsum-title ph">
        <span className="tset-dot" style={{ background: colorHex(cat.color) }} />
        <span className="name">{dir ? dir.name : cat.name}</span>
        <span className="norm">{norm}</span>
        {s.mode === 'daily' && s.mask?.source === 'inherited' && <span className="copied">↺ с прошлой недели</span>}
      </div>
    );
  }
  return (
    <div className="tsum-title">
      <span className="tset-dot" style={{ background: colorHex(cat.color) }} />
      <span className="name">{dir ? dir.name : `${cat.name} — вся категория`}</span>
      <span className="norm">· {dir ? normText(dir) : 'без нормы'}</span>
      {s.mode === 'daily' && s.mask?.source === 'inherited' && (
        <span className="copied"><Icon name="repeat" size={13} color="#8E9289" width={2} />график взят с прошлой недели</span>
      )}
    </div>
  );
}

type Cell = { t: string; kind?: 'dash' | 'gray' | 'dev' | 'bold' | 'label' | 'label2' | 'blank'; hl?: boolean };
const dash: Cell = { t: '—', kind: 'dash' };
const val = (m: number | null | undefined, kind?: Cell['kind']): Cell => (m ? { t: fmtHM(m), kind } : dash);
const dev = (m: number | null | undefined): Cell => (m === null || m === undefined ? dash : { t: fmtSigned(m), kind: 'dev' });
const blank: Cell = { t: '', kind: 'blank' };

/** Строки таблицы: Факт / План / Отклонение или Факт / Прошлая неделя / Разница. */
export function summaryRows(s: Summary): { label: string; alt?: boolean; cells: Cell[] }[] {
  const fact = { label: 'Факт', cells: [...s.fact.map((m) => val(m)), { t: fmtHM(s.factTotal), kind: 'bold' as const }, val(s.avg ? Math.round(s.avg) : null), dev(s.toPrev)] };
  if (s.mode === 'daily') {
    const workPlan = s.plan.filter((x) => x !== null).length;
    return [
      fact,
      { label: 'План', cells: [...s.plan.map((m) => val(m, 'gray')), val(s.planTotal, 'gray'), workPlan ? val(s.planTotal! / workPlan, 'gray') : dash, blank] },
      { label: 'Отклонение', alt: true, cells: [...s.dev.map(dev), dev(s.devTotal), blank, blank] },
    ];
  }
  return [
    fact,
    { label: 'Прошлая неделя', cells: [...s.prev.map((m) => val(m, 'gray')), val(s.prevTotal, 'gray'), val(s.prevTotal ? Math.round(s.prevTotal / 7) : null, 'gray'), blank] },
    { label: 'Разница', alt: true, cells: [...s.diff.map(dev), dev(s.diffTotal), blank, blank] },
  ];
}

function cellClass(c: Cell) {
  if (c.kind === 'dev') return c.t.startsWith('+') ? 'dev plus' : c.t.startsWith('−') ? 'dev minus' : 'dev zero';
  return c.kind ?? '';
}

function SumTable({ s, dir, cat, week }: { s: Summary; dir: TimeDirection | null; cat: TimeCategory; week: string }) {
  const toggle = useToggleWorkday();
  const clickable = s.mode === 'daily' && !!dir;
  const rows = summaryRows(s);
  return (
    <section className="tsum-block" aria-label={dir ? dir.name : cat.name}>
      <TableTitle s={s} dir={dir} cat={cat} />
      <div className="tsum-table" role="table">
        <div className="tsum-row head" role="row">
          <span role="columnheader" />
          {s.days.map((d, i) => {
            const work = s.mask ? isWorkday(s.mask.mask, i) : false;
            const label = `${WD[i]} ${Number(d.slice(8, 10))}`;
            return clickable ? (
              <button key={d} type="button" role="columnheader" className="tsum-day click" aria-pressed={work}
                aria-label={`${label}: ${work ? 'рабочий день — снять' : 'отметить рабочим днём'}`} title={work ? 'Рабочий день — клик снимает' : 'Клик — рабочий день'}
                onClick={() => toggle(dir!, week, s, i)}>
                <span>{label}</span><span className={'wd-dot' + (work ? ' on' : '')} />
              </button>
            ) : (
              <span key={d} role="columnheader" className="tsum-day"><span>{label}</span><span className="wd-dot" /></span>
            );
          })}
          <span role="columnheader" className="tsum-day tot"><span>Всего</span><span className="wd-dot" /></span>
          <span role="columnheader" className="tsum-day tot"><span>Среднее</span><span className="wd-dot" /></span>
          <span role="columnheader" className="tsum-day tot"><span>К прошлой*</span><span className="wd-dot" /></span>
        </div>
        {rows.map((r) => (
          <div key={r.label} className={'tsum-row' + (r.alt ? ' alt' : '')} role="row">
            <span role="rowheader" className={'tsum-label' + (r.label === 'Факт' ? '' : ' quiet')}>{r.label}</span>
            {r.cells.map((c, i) => (
              <span key={i} role="cell" className={'tsum-cell ' + cellClass(c) + (i >= 7 ? ' tot' : '')}>{c.t}</span>
            ))}
          </div>
        ))}
      </div>
      {s.month && <MonthFoot s={s} />}
    </section>
  );
}

function MonthFoot({ s }: { s: Summary }) {
  const m = s.month!;
  const pct = m.norm ? Math.min(100, m.fact / m.norm * 100) : 0;
  return (
    <div className="tsum-month">
      {monthName(m.month)}: {fmtHM(m.fact)} из {fmtHM(m.norm)}
      <span className="bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="rest">осталось {fmtHM(m.left)} · дней в месяце осталось {m.daysLeft}</span>
    </div>
  );
}

/** iPhone: каждая таблица — дни строками, точка слева от даты, тап по дате — рабочий день. */
function PhoneTable({ s, dir, cat, week }: { s: Summary; dir: TimeDirection | null; cat: TimeCategory; week: string }) {
  const toggle = useToggleWorkday();
  const clickable = s.mode === 'daily' && !!dir;
  const rows = summaryRows(s);
  const cols = rows.map((r) => r.label === 'Прошлая неделя' ? 'Прошлая' : r.label === 'Отклонение' ? 'Откл.' : r.label);
  return (
    <section className="tsum-block" aria-label={dir ? dir.name : cat.name}>
      <TableTitle s={s} dir={dir} cat={cat} />
      <div className="tpsum">
        <div className="tpsum-row head"><span className="first">День</span>{cols.map((c) => <span key={c}>{c}</span>)}</div>
        {s.days.map((d, i) => {
          const work = s.mask ? isWorkday(s.mask.mask, i) : false;
          const label = `${WD[i]} ${Number(d.slice(8, 10))}`;
          return (
            <div key={d} className="tpsum-row">
              {clickable ? (
                <button type="button" className="tpsum-day" aria-pressed={work} aria-label={`${label}: ${work ? 'рабочий день — снять' : 'отметить рабочим днём'}`}
                  onClick={() => toggle(dir!, week, s, i)}><span className={'wd-dot' + (work ? ' on' : '')} />{label}</button>
              ) : <span className="tpsum-day"><span className="wd-dot" />{label}</span>}
              {rows.map((r, k) => <span key={k} className={'tsum-cell ' + cellClass(r.cells[i])}>{r.cells[i].t}</span>)}
            </div>
          );
        })}
        {(['Всего', 'Среднее', 'К прошлой*'] as const).map((name, j) => (
          <div key={name} className="tpsum-row tot">
            <span className="tpsum-day">{name}</span>
            {rows.map((r, k) => <span key={k} className={'tsum-cell ' + cellClass(r.cells[7 + j])}>{r.cells[7 + j].t}</span>)}
          </div>
        ))}
      </div>
      {s.month && <MonthFoot s={s} />}
    </section>
  );
}

function TablesMenu({ anchor, onClose, tables, toggle, cats, dirs }: {
  anchor: Anchor; onClose: () => void; tables: SummaryTable[]; toggle: (t: SummaryTable) => void;
  cats: TimeCategory[]; dirs: TimeDirection[];
}) {
  const on = (t: SummaryTable) => tables.some((x) => sameTable(x, t));
  const item = (t: SummaryTable, name: string, note: string, strong?: boolean) => (
    <button key={t.kind + t.id} type="button" role="menuitemcheckbox" aria-checked={on(t)} className={'tsum-check' + (strong ? ' strong' : '')} onClick={() => toggle(t)}>
      <span className={'box' + (on(t) ? ' on' : '')}>{on(t) && <Icon name="check" size={10} width={3} />}</span>
      <span className="nm">{name}</span>
      {note && <span className="nt">{note}</span>}
    </button>
  );
  return (
    <Pop anchor={anchor} onClose={onClose} variant="light" width={300} title="Какие таблицы показывать">
      <div role="menu" aria-label="Какие таблицы показывать" className="tsum-menu">
        {cats.map((c) => {
          const own = dirs.filter((d) => d.category_id === c.id);
          return (
            <div key={c.id} style={{ display: 'contents' }}>
              <span className="tsum-menu-head"><span className="tset-dot" style={{ width: 8, height: 8, background: colorHex(c.color) }} />{c.name.toUpperCase()}{c.status === 'archived' ? ' · АРХИВ' : ''}</span>
              {item({ kind: 'category', id: c.id }, 'Вся категория', '', true)}
              {own.map((d) => item({ kind: 'direction', id: d.id }, d.name,
                [d.norm_type === 'daily' ? 'в рабочий день' : d.norm_type === 'monthly' ? 'в месяц' : '', d.status === 'archived' ? 'архив' : ''].filter(Boolean).join(' · ')))}
            </div>
          );
        })}
      </div>
    </Pop>
  );
}
