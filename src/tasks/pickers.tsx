import { useRef, useState } from 'react';
import { useStore, useToday } from '../lib/store';
import { addDays, fmtMin, parseISO } from '../lib/dates';
import type { Skill, Task } from '../lib/types';
import { Icon, ICONS } from '../ui/icons';
import { Pop, PopItem, PopSep, type Anchor } from '../ui/Pop';
import { SKILL_ICONS } from '../ui/skillIcons';
import { useIsPhone } from '../ui/useIsPhone';

type When = Pick<Task, 'when_date' | 'when_evening' | 'someday'>;

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_SHORT = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Окно «Когда»: Сегодня, Сегодня вечером, Завтра, календарь, Когда-нибудь, Убрать срок. */
export function WhenPicker({ value, anchor, onPick, onClose, dateOnly }: {
  value: When; anchor: Anchor | null; onPick: (v: When) => void; onClose: () => void;
  /** Только дата (в окне повтора): без «вечером», «когда-нибудь» и «убрать срок». */
  dateOnly?: boolean;
}) {
  const today = useToday();
  const phone = useIsPhone();
  const [page, setPage] = useState(0);
  const tomorrow = addDays(today, 1);
  const tm = parseISO(tomorrow);
  const pick = (v: When) => { onClose(); onPick(v); };
  const isToday = !value.someday && value.when_date !== null && value.when_date <= today;

  // Календарь: недели с понедельника текущей недели, по 5 недель на страницу.
  const t = parseISO(today);
  const monday = addDays(today, -((t.getDay() + 6) % 7) + page * 35);
  const cells: React.ReactNode[] = [];
  const cellH = phone ? 44 : 30;
  for (let i = 0; i < 35; i++) {
    const d = addDays(monday, i);
    const isFirstNav = page > 0 && i === 0;
    const isLastNav = i === 34;
    if (isFirstNav || isLastNav) {
      cells.push(
        <button key={'nav' + i} type="button" className="cal-cell cal-nav" style={{ height: cellH }}
          aria-label={isLastNav ? 'Дальше' : 'Назад'} onClick={() => setPage((p) => p + (isLastNav ? 1 : -1))}>
          {isLastNav ? '›' : '‹'}
        </button>,
      );
      continue;
    }
    if (d < today) { cells.push(<span key={d} className="cal-cell" style={{ height: cellH }} />); continue; }
    const dd = parseISO(d);
    const selected = !value.someday && value.when_date === d;
    const label = d === today
      ? <Icon name="today" size={15} color={selected ? '#15171A' : '#C5F25A'} width={2.2} />
      : dd.getDate() === 1 ? <span style={{ fontSize: 10, lineHeight: 1.1 }}>{MONTHS_SHORT[dd.getMonth()]}<br />1</span> : dd.getDate();
    cells.push(
      <button key={d} type="button" className={'cal-cell' + (selected ? ' selected' : '')} style={{ height: cellH }}
        aria-label={`${dd.getDate()} ${MONTHS_GEN[dd.getMonth()]}`} aria-pressed={selected}
        onClick={() => pick({ when_date: d, when_evening: false, someday: false })}>
        {label}
      </button>,
    );
  }

  return (
    <Pop anchor={anchor} onClose={onClose} title="Когда" width={280}>
      <PopItem icon="today" iconColor="#C5F25A" label="Сегодня" selected={isToday && !value.when_evening}
        onClick={() => pick({ when_date: today, when_evening: false, someday: false })} />
      {!dateOnly && (
        <PopItem icon="evening" label="Сегодня вечером" selected={isToday && value.when_evening}
          onClick={() => pick({ when_date: today, when_evening: true, someday: false })} />
      )}
      <PopItem icon="tomorrow" label="Завтра" hint={`${WD_SHORT[tm.getDay()]}, ${tm.getDate()} ${MONTHS[tm.getMonth()]}`}
        selected={!value.someday && value.when_date === tomorrow}
        onClick={() => pick({ when_date: tomorrow, when_evening: false, someday: false })} />
      <PopSep />
      <div className="cal">
        {WD.map((w) => <span key={w} className="cal-wd">{w}</span>)}
        {cells}
      </div>
      {!dateOnly && (
        <>
          <PopSep />
          <PopItem icon="someday" label="Когда-нибудь" selected={value.someday}
            onClick={() => pick({ when_date: null, when_evening: false, someday: true })} />
          <PopItem icon="clear" label="Убрать срок" muted
            onClick={() => pick({ when_date: null, when_evening: false, someday: false })} />
        </>
      )}
    </Pop>
  );
}

const PRESETS = [15, 30, 45, 60, 75, 90, 120, 150];

/** «ч:мм» или число минут → минуты. */
export function parseEstimate(s: string): number | null {
  const t = s.trim().replace(',', ':').replace('.', ':');
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d{1,4}$/.test(t)) return Number(t);
  return null;
}

/** Окно оценки: плитки 0:15 … 2:30, «3:00+» → своё значение, «Своё» (ч:мм), «Убрать оценку». */
export function EstimatePicker({ value, anchor, onPick, onClose }: {
  value: number | null; anchor: Anchor | null; onPick: (v: number | null) => void; onClose: () => void;
}) {
  const [own, setOwn] = useState(value !== null && !PRESETS.includes(value) ? fmtMin(value) : '');
  const ownRef = useRef<HTMLInputElement>(null);
  const pick = (v: number | null) => { onClose(); onPick(v); };
  const ownMin = parseEstimate(own);
  return (
    <Pop anchor={anchor} onClose={onClose} title="Оценка времени" width={256}>
      <div className="est-pop">
        <span className="est-head">Оценка времени</span>
        <div className="est-grid">
          {PRESETS.map((m) => (
            <button key={m} type="button" className={'est-tile' + (value === m ? ' selected' : '')} aria-pressed={value === m}
              onClick={() => pick(m)}>{fmtMin(m)}</button>
          ))}
          <button type="button" className={'est-tile' + (value !== null && value >= 180 ? ' selected' : '')}
            onClick={() => { setOwn(value !== null && value >= 180 ? fmtMin(value) : '3:00'); setTimeout(() => ownRef.current?.select()); }}>
            3:00+
          </button>
        </div>
        <form className="est-own" onSubmit={(e) => { e.preventDefault(); if (ownMin !== null && ownMin > 0) pick(ownMin); }}>
          <label htmlFor="own-est">Своё</label>
          <input id="own-est" ref={ownRef} type="text" inputMode="numeric" placeholder="ч:мм" value={own}
            onChange={(e) => setOwn(e.target.value)} enterKeyHint="done" />
          <button type="submit" className="est-ok" disabled={ownMin === null || ownMin <= 0}>OK</button>
        </form>
        {value !== null && <PopItem label="Убрать оценку" muted onClick={() => pick(null)} />}
      </div>
    </Pop>
  );
}

export const skillIcon = (s: Pick<Skill, 'icon'> | undefined): string =>
  (s && (SKILL_ICONS[s.icon] || (ICONS as Record<string, string>)[s.icon])) || ICONS.skill;

function SkillGlyph({ skill, color = 'currentColor', size = 17 }: { skill: Skill; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={skillIcon(skill)} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Окно «Навык»: по веткам Креатор / Профессия. Для задачи в проекте сверху «Как у проекта (…)» = навык не задан вручную.
 * Скрытый навык показывается внизу приглушённо, только если он уже выбран.
 */
export function SkillPicker({ value, inherited, forProject, anchor, onPick, onClose }: {
  value: string | null; inherited?: Skill; forProject?: boolean;
  anchor: Anchor | null; onPick: (id: string | null) => void; onClose: () => void;
}) {
  const store = useStore();
  const pick = (id: string | null) => { onClose(); onPick(id); };
  const skills = store.skills.filter((s) => !s.deleted_at).sort((a, b) => a.sort_order - b.sort_order);
  const branches: { key: Skill['branch']; name: string }[] = [{ key: 'creator', name: 'Креатор' }, { key: 'profession', name: 'Профессия' }];
  const current = skills.find((s) => s.id === value);
  return (
    <Pop anchor={anchor} onClose={onClose} title={forProject ? 'Навык по умолчанию' : 'Навык'} width={280}>
      {inherited && !forProject ? (
        <button type="button" className={'pop-item' + (value === null ? ' selected' : '')} aria-pressed={value === null} onClick={() => pick(null)}>
          <SkillGlyph skill={inherited} />
          <span className="pop-label">Как у проекта <span style={{ color: '#B4B8B0', fontWeight: 600 }}>({inherited.name})</span></span>
          {value === null && <Icon name="check" size={15} color="#C5F25A" width={2.4} />}
        </button>
      ) : (
        <PopItem icon="clear" label="Без навыка" muted={value !== null} selected={value === null} onClick={() => pick(null)} />
      )}
      {branches.map((b) => (
        <div key={b.key} style={{ display: 'contents' }}>
          <div className="pop-group-name">{b.name}</div>
          {skills.filter((s) => s.branch === b.key && s.active).map((s) => (
            <button key={s.id} type="button" className={'pop-item' + (value === s.id ? ' selected' : '')}
              aria-pressed={value === s.id} onClick={() => pick(s.id)} style={{ fontWeight: 600 }}>
              <SkillGlyph skill={s} />
              <span className="pop-label">{s.name}</span>
              {value === s.id && <Icon name="check" size={15} color="#C5F25A" width={2.4} />}
            </button>
          ))}
        </div>
      ))}
      {current && !current.active && (
        <button type="button" className="pop-item selected muted" aria-pressed>
          <SkillGlyph skill={current} />
          <span className="pop-label">{current.name}</span>
          <span className="pop-hint">скрыт</span>
        </button>
      )}
    </Pop>
  );
}

export { SkillGlyph };
