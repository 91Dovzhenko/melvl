// Общий календарь дат (Спецификация, раздел 12): тёмный, 280, сетка Пн–Вс, шапка «Декабрь 2027» со стрелками ‹ ›,
// выбранный день — лайм, внизу «Убрать срок» (если дату можно снять). Mac — окно у кнопки, iPhone — нижний лист.
import { useState } from 'react';
import { iso, parseISO } from '../lib/dates';
import { useToday } from '../lib/store';
import { Pop, PopItem, PopSep, type Anchor } from './Pop';
import { useIsPhone } from './useIsPhone';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/** Формат даты по всему приложению: «1 мар. 2027». */
export function fmtDate(s: string) {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function DatePicker({ value, anchor, title, clearLabel, onPick, onClose }: {
  value: string | null; anchor: Anchor | null; title: string;
  /** Подпись пункта «убрать дату»; без неё — дату снять нельзя. */
  clearLabel?: string;
  onPick: (d: string | null) => void; onClose: () => void;
}) {
  const today = useToday();
  const cellH = useIsPhone() ? 44 : 30;
  const start = parseISO(value ?? today);
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(month.y, month.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const shift = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const pick = (d: string | null) => { onClose(); onPick(d); };

  return (
    <Pop anchor={anchor} onClose={onClose} title={title} width={280}>
      <div className="dp-head">
        <button type="button" className="dp-nav" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>‹</button>
        <span>{MONTHS_NOM[month.m]} {month.y}</span>
        <button type="button" className="dp-nav" aria-label="Следующий месяц" onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal">
        {WD.map((w) => <span key={w} className="cal-wd">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={'e' + i} className="cal-cell" style={{ height: cellH }} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = iso(new Date(month.y, month.m, i + 1));
          const sel = d === value;
          return (
            <button key={d} type="button" className={'cal-cell' + (sel ? ' selected' : '') + (d === today && !sel ? ' today' : '')}
              style={{ height: cellH }} aria-label={`${i + 1} ${MONTHS_GEN[month.m]} ${month.y}`} aria-pressed={sel} onClick={() => pick(d)}>{i + 1}</button>
          );
        })}
      </div>
      {clearLabel && (
        <>
          <PopSep />
          <PopItem icon="clear" label={clearLabel} muted onClick={() => pick(null)} />
        </>
      )}
    </Pop>
  );
}
