// Моменты роста при отметке задачи (15_ТЗ, п. 4.4; холст — ряд «Моменты роста», Спецификация, разделы 10 и 15).
// Фанфары — только за отметку задачи. Любые другие пересчёты (правка оценки, перенос навыка, синхронизация) — тихо.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGrowthData, useStore, useToday } from '../lib/store';
import { completeFields } from '../lib/logbook';
import { chapterSummary, hoursSnapshot, taskMoment, type TaskMoment } from '../lib/growth/growth';
import { ChapterSummaryView } from './ChapterSummary';
import { levelInfo } from '../lib/growth/levels';
import { branchName, fmtH } from '../lib/growth/format';
import type { Task } from '../lib/types';
import { SKILL_ICONS } from '../ui/skillIcons';
import { useIsPhone } from '../ui/useIsPhone';

const BRANCH_ICON = 'M6 13.5l6-5 6 5 M6 19.5l6-5 6 5 M12 3v2.5';
const UNDO_ICON = 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11';

type Shown =
  | { kind: 'hours'; taskId: string; skill: string; icon: string; minutes: number }
  | { kind: 'level'; taskId: string; rows: { kind: string; name: string; level: number; icon: string; round: boolean }[]; note: string }
  | { kind: 'reopened'; skill: string; minutes: number; level: number };

const DURATION = { hours: 6000, level: 8000, reopened: 4000 } as const;

type Ctx = { toggle: (task: Task) => void };
const MomentsCtx = createContext<Ctx | null>(null);

export function useTaskToggle() {
  const c = useContext(MomentsCtx);
  if (!c) throw new Error('MomentsProvider not mounted');
  return c.toggle;
}

export function MomentsProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const nav = useNavigate();
  const [shown, setShown] = useState<(Shown & { key: number }) | null>(null);
  const [congrats, setCongrats] = useState<{ level: number; chapter: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const storeRef = useRef(store);
  storeRef.current = store;

  const show = useCallback((s: Shown) => {
    window.clearTimeout(timer.current);
    setShown({ ...s, key: Date.now() });
    timer.current = window.setTimeout(() => setShown(null), DURATION[s.kind]);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Снять отметку тихо: уровень откатывается, плашка «Задача снова открыта» — если задача давала часы. */
  const reopen = useCallback((taskId: string) => {
    const s = storeRef.current;
    const m = taskMoment(s, taskId);
    s.patch('tasks', taskId, { status: 'open', completed_at: null, logged_at: null });
    if (m.kind === 'none') { window.clearTimeout(timer.current); setShown(null); return; }
    show({ kind: 'reopened', skill: s.skills.find((x) => x.id === m.skillId)?.name ?? '', minutes: m.minutes, level: m.skill.from });
  }, [show]);

  const toggle = useCallback((task: Task) => {
    const s = storeRef.current;
    if (task.status === 'completed') { reopen(task.id); return; }
    const fields = completeFields(s.settings.log_mode);
    // Моменты считаем по данным «после отметки» сразу, не дожидаясь обновления состояния.
    const after = { tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, ...fields } as Task : t)), projects: s.projects, skills: s.skills };
    const m = taskMoment(after, task.id);
    s.patch('tasks', task.id, fields);
    // Новый общий уровень — громко: экран поздравления поверх текущего экрана (вместо плашки).
    if (m.kind === 'total') { window.clearTimeout(timer.current); setShown(null); setCongrats({ level: m.total.to, chapter: m.closedChapter! }); return; }
    const view = describe(m, after, task.id);
    if (view) show(view); else { window.clearTimeout(timer.current); setShown(null); }
  }, [reopen, show]);

  const close = () => { window.clearTimeout(timer.current); setShown(null); };
  const undo = (taskId: string) => reopen(taskId);

  return (
    <MomentsCtx.Provider value={{ toggle }}>
      {children}
      {congrats && <Congrats level={congrats.level} chapter={congrats.chapter} onClose={() => setCongrats(null)} />}
      {shown && <MomentToast key={shown.key} s={shown} onUndo={undo} onView={() => { close(); nav('/character'); }} />}
    </MomentsCtx.Provider>
  );
}

function describe(m: TaskMoment, data: Parameters<typeof taskMoment>[0], taskId: string): Shown | null {
  if (m.kind === 'none') return null;
  const sk = data.skills.find((x) => x.id === m.skillId);
  const icon = (sk && SKILL_ICONS[sk.icon]) || SKILL_ICONS.target || '';
  const name = sk?.name ?? '';
  if (m.kind === 'hours') return { kind: 'hours', taskId, skill: name, icon, minutes: m.minutes };
  const rows: Extract<Shown, { kind: 'level' }>['rows'] = [];
  if (m.skill.to > m.skill.from) rows.push({ kind: 'Новый уровень навыка', name, level: m.skill.to, icon, round: true });
  if (m.branchLevel.to > m.branchLevel.from) rows.push({ kind: 'Новый уровень ветки', name: branchName(m.branch), level: m.branchLevel.to, icon: BRANCH_ICON, round: false });
  // Подпись: навык вырос (или вырос и навык, и ветка) — «до уровня» навыка; выросла только ветка — «до» ветки.
  const h = hoursSnapshot(data);
  const plus = '+' + fmtH(m.minutes);
  let note: string;
  if (m.skill.to > m.skill.from || m.branchLevel.to === m.branchLevel.from) {
    const info = levelInfo('skill', h.skill.get(m.skillId) ?? 0);
    note = `${plus} · до уровня ${info.level + 1} — ${fmtH(info.toNext)}`;
  } else {
    const info = levelInfo('branch', h.branch.get(m.branch) ?? 0);
    note = `${plus} ${name} · до ${info.level + 1} — ${fmtH(info.toNext)}`;
  }
  return { kind: 'level', taskId, rows, note };
}

function Glyph({ d, size, color }: { d: string; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ position: 'relative', flexShrink: 0 }}>
      <path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MomentToast({ s, onUndo, onView }: { s: Shown; onUndo: (taskId: string) => void; onView: () => void }) {
  if (s.kind === 'hours') {
    return (
      <div className="moment moment-hours" role="status">
        <span className="m-done">Сделано</span>
        <span className="m-chip"><Glyph d={s.icon} size={13} color="#15171A" />{s.skill} +{fmtH(s.minutes)}</span>
        <button type="button" className="m-btn" onClick={() => onUndo(s.taskId)}>Отменить</button>
        <span className="m-timer" aria-hidden="true" style={{ animationDuration: `${DURATION.hours}ms` }} />
      </div>
    );
  }
  if (s.kind === 'reopened') {
    return (
      <div className="moment moment-undo" role="status">
        <Glyph d={UNDO_ICON} size={16} color="#B4B8B0" />
        <span className="m-col"><span className="m-text">Задача снова открыта</span>
          <span className="m-sub">{s.skill} −{fmtH(s.minutes)}, уровень {s.level}</span></span>
      </div>
    );
  }
  return (
    <div className="moment moment-level" role="status">
      {s.rows.map((r) => (
        <div className="m-row" key={r.kind}>
          <span className="m-ico">
            <span className="m-aura" aria-hidden="true" />
            <span className="m-disc" style={{ borderRadius: r.round ? '50%' : 14 }} />
            <Glyph d={r.icon} size={22} color="#C5F25A" />
          </span>
          <span className="m-body">
            <span className="m-kind">{r.kind}</span>
            <span className="m-name">{r.name}<Glyph d="M5 12h14 M13 6l6 6-6 6" size={14} color="#8E9289" /><b>уровень {r.level}</b></span>
          </span>
        </div>
      ))}
      <div className="m-foot">
        <span className="m-note">{s.note}</span>
        <button type="button" className="m-btn" onClick={() => onUndo(s.taskId)}>Отменить</button>
        <button type="button" className="m-btn lime" onClick={onView}>Посмотреть</button>
      </div>
    </div>
  );
}

const CHARACTER_IMG = `${import.meta.env.BASE_URL}character.png`;

/**
 * Экран поздравления общего уровня: Mac — поверх текущего экрана, персонаж с аурой слева, сводка закрывшейся главы справа.
 * Закрыть: «Готово», крестик ×, Esc — возврат туда, где был.
 */
function Congrats({ level, chapter, onClose }: { level: number; chapter: number; onClose: () => void }) {
  const data = useGrowthData();
  const today = useToday();
  const s = chapterSummary(data, chapter, today);
  const done = useRef<HTMLButtonElement>(null);
  const phone = useIsPhone();
  useEffect(() => {
    if (!phone) done.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, phone]);
  if (phone) {
    // iPhone: тёмный экран с персонажем, ниже белый лист со сводкой (прокрутка); «Готово» закреплена внизу, × — сверху.
    return (
      <div className="pcongrats" role="dialog" aria-modal="true" aria-label="Новый общий уровень">
        <div className="pcg-scroll">
          <div className="pcg-hero">
            <div className="hero-pic sm"><div className="hero-aura" aria-hidden="true" /><div className="hero-floor" aria-hidden="true" /><img src={CHARACTER_IMG} alt="Персонаж" /></div>
            <span className="kicker">Новый общий уровень</span>
            <span className="lvl">Уровень <b>{level}</b></span>
            <span className="ch">Глава {chapter} закрыта · начинается глава {chapter + 1}</span>
            <span className="pts">Очки за уровень · скоро</span>
          </div>
          <div className="pcg-sheet">{s && <ChapterSummaryView s={s} framed />}</div>
        </div>
        <button type="button" className="congrats-x fixed" aria-label="Закрыть" onClick={onClose}><Glyph d="M6 6l12 12 M18 6L6 18" size={16} color="#15171A" /></button>
        <div className="pcg-foot"><button type="button" ref={done} className="congrats-done wide" onClick={onClose}>Готово</button></div>
      </div>
    );
  }
  return (
    <div className="congrats" role="dialog" aria-modal="true" aria-label="Новый общий уровень">
      <button type="button" className="congrats-x" aria-label="Закрыть (Esc)" title="Закрыть · Esc" onClick={onClose}>
        <Glyph d="M6 6l12 12 M18 6L6 18" size={16} color="#15171A" />
      </button>
      <div className="congrats-hero">
        <div className="hero-pic">
          <div className="hero-aura" aria-hidden="true" />
          <div className="hero-floor" aria-hidden="true" />
          <img src={CHARACTER_IMG} alt="Персонаж" />
        </div>
        <span className="kicker">Новый общий уровень</span>
        <span className="lvl">Уровень <b>{level}</b></span>
        <span className="ch">Глава {chapter} закрыта · начинается глава {chapter + 1}</span>
        <span className="pts">Очки за уровень · скоро</span>
        <button type="button" ref={done} className="congrats-done" onClick={onClose}>Готово</button>
      </div>
      {s && <ChapterSummaryView s={s} framed />}
    </div>
  );
}
