// Раздел «Цели» (15_ТЗ, п. 4.8 и 5; холст — ряд «Цели», Спецификация, раздел 12).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, useToday } from '../lib/store';
import { shortDate } from '../lib/dates';
import {
  averageAt, currentValue, fmtNum, forecast, forecastText, leftText, nextStepLeft, pace, parseNum, reachedByRule, shiftBack,
  sortedMeasurements, sortedSteps, stepRule, stepsTakenBy,
} from '../lib/growth/goals';
import { plural } from '../lib/growth/format';
import type { Goal, GoalCalc, GoalMeasurement, GoalStatus, GoalStep, PeriodUnit } from '../lib/types';
import { Icon } from '../ui/icons';
import { DatePicker, fmtDate } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import type { Anchor } from '../ui/Pop';
import { useIsPhone } from '../ui/useIsPhone';
import { BottomSheet } from './Character';

const TROPHY = 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8.5 20h7 M10 17h4v3h-4z';
const STATUS: Record<GoalStatus, string> = { active: 'активна', paused: 'на паузе', achieved: 'достигнута', canceled: 'отменена' };
const STATUS_ORDER: GoalStatus[] = ['active', 'paused', 'achieved', 'canceled'];
const CALC: Record<GoalCalc, string> = { once: 'один раз', average: 'среднее за период' };
const periodText = (n: number, u: PeriodUnit) => `${n} ${u === 'month' ? plural(n, 'месяц', 'месяца', 'месяцев') : plural(n, 'неделя', 'недели', 'недель')}`;
const periodShort = (n: number, u: PeriodUnit) => `${n} ${u === 'month' ? 'мес' : 'нед'}`;
const signed = (v: number) => (v >= 0 ? '+' : '−') + fmtNum(Math.abs(Math.round(v)));
/** «30 сент.» уже с точкой, «4 мая» — без: точка в конце фразы ставится один раз. */
const endDot = (t: string) => (t.endsWith('.') ? t : t + '.');
const stepName = (s: GoalStep, last: boolean) => s.title || fmtNum(s.threshold) + (last ? ' — цель' : '');

function Trophy({ size = 16, color = '#3D6A00', width = 2 }: { size?: number; color?: string; width?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, position: 'relative' }}><path d={TROPHY} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
const StatusChip = ({ s }: { s: GoalStatus }) => <span className={'gst ' + s}>{STATUS[s]}</span>;

function useGoalData(goalId: string | undefined) {
  const { goals, goal_steps, goal_measurements } = useStore();
  return useMemo(() => ({
    goal: goals.find((g) => g.id === goalId),
    steps: goal_steps.filter((s) => s.goal_id === goalId),
    ms: goal_measurements.filter((m) => m.goal_id === goalId),
  }), [goals, goal_steps, goal_measurements, goalId]);
}

// Ступени, взятые в этой сессии сегодня, — аура на лестнице до конца дня.
const auraSteps = new Map<string, string>();

// ───────────── Плашки ─────────────

type Toast = { kind: 'deleted'; text: string; undo: () => void } | { kind: 'step'; title: string; sub: string };
function useToast() {
  const [t, setT] = useState<(Toast & { key: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (x: Toast) => {
    window.clearTimeout(timer.current);
    setT({ ...x, key: Date.now() });
    timer.current = window.setTimeout(() => setT(null), x.kind === 'step' ? 8000 : 6000);
  };
  const node = t && (t.kind === 'deleted' ? (
    <div key={t.key} className="moment moment-hours" role="status">
      <span className="m-text-w">{t.text}</span>
      <button type="button" className="m-btn" onClick={() => { t.undo(); setT(null); }}>Отменить</button>
    </div>
  ) : (
    <div key={t.key} className="moment moment-level step-toast" role="status">
      <div className="m-row">
        <span className="m-ico"><span className="m-aura" aria-hidden="true" /><span className="m-disc" style={{ borderRadius: 14 }} /><Trophy size={22} color="#C5F25A" width={1.9} /></span>
        <span className="m-body"><span className="m-kind">Ступень взята</span><span className="m-name">{t.title}</span><span className="m-kind">{t.sub}</span></span>
      </div>
    </div>
  ));
  return { node, show };
}

// ───────────── Список ─────────────

export function GoalsScreen() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const goals = [...store.goals].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.sort_order - b.sort_order);
  const creating = params.get('new') === '1';
  const count = (s: GoalStatus) => store.goals.filter((g) => g.status === s).length;
  const meta = goals.length
    ? [[count('active'), 'активна', 'активны', 'активны'], [count('paused'), 'на паузе', 'на паузе', 'на паузе'], [count('achieved'), 'достигнута', 'достигнуты', 'достигнуты'], [count('canceled'), 'отменена', 'отменены', 'отменены']]
      .filter(([n]) => (n as number) > 0).map(([n, a, b, c]) => `${n} ${plural(n as number, a as string, b as string, c as string)}`).join(' · ')
    : 'пока пусто';
  const toast = useToast();
  const phone = useIsPhone();

  return (
    <div className="goals-page">
      <header className="goals-head">
        <h1>Цели</h1><span>{meta}</span>
        <button type="button" className="btn-lime" onClick={() => setParams({ new: '1' })}><Icon name="plus" size={14} color="#15171A" width={2.6} />Новая цель</button>
      </header>
      {goals.length ? (
        <div className="goal-grid">{goals.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
      ) : (
        <div className="goals-empty">
          <span className="ico"><Trophy size={26} width={1.9} /></span>
          <span className="t">Целей пока нет</span>
          <span className="h">Цель меряется замерами — подписчики, доход, книги. Ступени ведут к ней по шагам и берутся сами, когда замер дошёл до порога.</span>
          <button type="button" className="btn-lime" onClick={() => setParams({ new: '1' })}>Новая цель</button>
        </div>
      )}
      {phone && !creating && <button type="button" className="fab" aria-label="Новая цель" onClick={() => setParams({ new: '1' })}><Icon name="plus" size={26} color="#15171A" width={2.2} /></button>}
      {creating && <GoalForm onClose={(id) => { setParams({}); if (id) nav(`/goals/${id}`); }} toast={toast.show} />}
      {toast.node}
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const { steps, ms } = useGoalData(goal.id);
  const list = sortedSteps(steps);
  const next = nextStepLeft(goal, steps, ms);
  const nextIdx = next ? list.indexOf(next.step) : -1;
  const taken = list.filter((s) => s.taken_at).length;
  const sm = sortedMeasurements(ms);
  const now = currentValue(ms);
  const last = sm[sm.length - 1];
  let foot = CALC[goal.calc];
  if (goal.status === 'achieved') foot += goal.achieved_at ? ` · достигнута ${shortDate(goal.achieved_at)}` : '';
  else if (goal.status === 'canceled') foot = 'отменена · без последствий';
  else foot += (last ? ` · замер ${shortDate(last.date)}` : ' · замеров нет') + (goal.review_date ? ` · пересмотр ${fmtDate(goal.review_date)}` : '');
  return (
    <Link to={`/goals/${goal.id}`} className={'gcard' + (goal.status === 'canceled' ? ' off' : '')}>
      <div className="gcard-top"><Trophy /><span className="t">{goal.title || 'Новая цель'}</span><StatusChip s={goal.status} /></div>
      <span className="gnow"><b>{now === null ? '—' : fmtNum(now)}</b><span>из {fmtNum(goal.target_value)} · {goal.metric}</span></span>
      {list.length > 0 && <span className="gsegs">{list.map((s, i) => <span key={s.id} style={{ background: s.taken_at ? '#3D6A00' : i === nextIdx ? '#C5F25A' : '#E3E5DF' }} />)}</span>}
      <span className="gnext-line">
        {goal.status === 'canceled' ? `Остановлена на ступени ${taken} из ${list.length}`
          : next ? <>Следующая ступень <b>{fmtNum(next.step.threshold)}</b> · {next.left === null ? leftText(next) : <>осталось <b>{fmtNum(Math.max(0, next.left))}</b></>}</>
          : list.length ? 'Все ступени взяты' : 'Ступеней пока нет'}
      </span>
      {reachedByRule(goal, steps) && <span className="suggest-chip">Достигнута по правилу — отметить?</span>}
      <span className="gfoot">{foot}</span>
    </Link>
  );
}

// ───────────── Экран цели ─────────────

export function GoalScreen() {
  const { id } = useParams();
  const store = useStore();
  const today = useToday();
  const { goal, steps, ms } = useGoalData(id);
  const [form, setForm] = useState(false);
  const [measure, setMeasure] = useState<GoalMeasurement | 'new' | null>(null);
  const toast = useToast();
  const phone = useIsPhone();
  if (!goal) return store.loading ? null : <Navigate to="/goals" replace />;

  const list = sortedSteps(steps);
  const sm = sortedMeasurements(ms);
  const now = currentValue(ms);
  const next = nextStepLeft(goal, steps, ms);
  const p = pace(goal, ms);
  const f = forecast(goal, steps, ms, today);
  const reached = reachedByRule(goal, steps);
  const lastStep = list[list.length - 1];
  const span = goal.target_value - goal.start_value;
  const pct = now === null || span <= 0 ? 0 : Math.max(0, Math.min(1, (now - goal.start_value) / span));
  const foreText = (f.kind === 'weeks' || f.kind === 'month' || f.kind === 'year')
    ? `следующая ступень ${fmtNum(f.step.threshold)} — ${forecastText(f)}` : forecastText(f);
  const quietFore = f.kind === 'needSecond' || f.kind === 'unknown' || f.kind === 'needHistory';
  const chips = [
    ['Метрика', goal.metric || '—'], ['Считаем', CALC[goal.calc]], ['Период', periodText(goal.period_n, goal.period_unit)],
    ...(goal.due_date ? [['Срок', fmtDate(goal.due_date)]] : []), ...(goal.review_date ? [['Пересмотр', fmtDate(goal.review_date)]] : []),
  ];

  return (
    <div className="goals-page">
      <nav aria-label="Путь" className="crumbs"><Link to="/goals">Цели</Link><Icon name="chevronRight" size={12} color="#8E9289" width={2.4} /><span>{goal.title || 'Новая цель'}</span></nav>
      <header className="goal-head">
        <div className="row">
          <h1>{goal.title || 'Новая цель'}</h1><StatusChip s={goal.status} />
          <div className="acts">
            <button type="button" className="btn-sec" onClick={() => setForm(true)}>Изменить</button>
            <button type="button" className="btn-lime" onClick={() => setMeasure('new')}><Icon name="plus" size={14} color="#15171A" width={2.6} />Добавить замер</button>
          </div>
        </div>
        {goal.criterion && <p>Критерий: {goal.criterion}</p>}
        <div className="gchips">{chips.map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}</div>
      </header>

      {reached && (
        <div role="note" className="reached-note">
          <span className="ico"><Trophy size={18} color="#C5F25A" /></span>
          <span className="tx"><b>Достигнута по правилу — отметить?</b>
            <span>{now !== null ? `${fmtNum(now)} из ${fmtNum(goal.target_value)} · ` : ''}последняя ступень взята {endDot(shortDate(lastStep.taken_at!))} Плашка висит, пока цель не отмечена. Цель отмечаешь ты: критерий шире метрики.</span></span>
          <button type="button" className="btn-lime sm" onClick={() => store.patch('goals', goal.id, { status: 'achieved', achieved_at: today })}>Отметить достигнутой</button>
        </div>
      )}

      <section aria-label="Старт, сейчас, цель" className="ssc">
        <span className="c1"><span>Старт{sm[0] ? ` · ${shortDate(sm[0].date)}` : ''}</span><b>{fmtNum(goal.start_value)}</b></span>
        <span className="c2"><span>Сейчас{sm.length ? ` · ${shortDate(sm[sm.length - 1].date)}` : ''}</span><b>{now === null ? '—' : fmtNum(now)}</b></span>
        <span className="c3"><span>Цель · {goal.metric}</span><b>{fmtNum(goal.target_value)}</b></span>
        <span className="bar"><span style={{ width: `${pct * 100}%` }} /></span>
      </section>

      <div className="goal-body">
        <section aria-label="Ступени" className="ladder">
          <div className="sec-head"><h2>Ступени</h2><span>{list.filter((s) => s.taken_at).length} из {list.length} взято · берутся сами по правилу</span></div>
          {[...list].reverse().map((s) => {
            const i = list.indexOf(s);
            const isNext = next?.step.id === s.id;
            const glow = auraSteps.get(s.id) === today;
            return (
              <div key={s.id} className={'lstep' + (s.taken_at ? ' taken' : isNext ? ' next' : '') + (glow ? ' glow' : '')}>
                <div className="row">
                  {s.taken_at ? <span className="tro"><Trophy color="#C5F25A" /></span> : <span className="num">{i + 1}</span>}
                  <span className="tx"><b>{stepName(s, i === list.length - 1)}</b>
                    {s.taken_at ? <span>взята {s.taken_at === today ? 'сегодня' : shortDate(s.taken_at)}</span>
                      : isNext ? <span>{leftText(next!)}{next!.byAverage && next!.base !== null ? ` · среднее ${fmtNum(next!.base)}` : ''}</span> : null}</span>
                  {isNext && <span className="next-pill">следующая</span>}
                </div>
                {isNext && next!.base !== null && <span className="bar"><span style={{ width: `${Math.max(0, Math.min(100, (next!.base / s.threshold) * 100))}%` }} /></span>}
              </div>
            );
          })}
          {list.length === 0 && <span className="muted-note">Ступеней пока нет — добавь их в «Изменить».</span>}
        </section>

        <div className="goal-right">
          <section aria-label="Темп и прогноз" className="pace">
            <span><span className="l">Темп за {periodShort(goal.period_n, goal.period_unit)}</span>
              {p && sm.length >= 2 ? <b>{signed(p.perUnit)} <span>{p.unit === 'month' ? 'в месяц' : 'в неделю'}</span></b> : <span className="none">пока не определён</span>}</span>
            <span><span className="l">Прогноз</span><span className={'fore' + (quietFore ? ' quiet' : '')}>{foreText}</span></span>
          </section>
          <Chart goal={goal} ms={sm} nextTh={next?.step.threshold ?? null} w={phone ? 359 : 554} h={phone ? 200 : 220} />
          <section aria-label="История замеров" className="mtable">
            <div className="mrow head"><span>Дата</span><span className="r">Значение</span><span>Комментарий</span></div>
            {[...sm].reverse().map((m) => (
              <button key={m.id} type="button" className="mrow click" aria-label={`Замер ${shortDate(m.date)}: ${fmtNum(m.value)} — изменить`} onClick={() => setMeasure(m)}>
                <span className="d">{shortDate(m.date)}</span><span className="r v">{fmtNum(m.value)}</span><span className="c">{m.comment || '—'}</span></button>
            ))}
            {sm.length === 0 && <span className="muted-note">Замеров пока нет.</span>}
          </section>
        </div>
      </div>

      {phone && !form && !measure && <button type="button" className="fab-pill" onClick={() => setMeasure('new')}><Icon name="plus" size={18} color="#15171A" width={2.4} />Замер</button>}
      {form && <GoalForm goal={goal} onClose={() => setForm(false)} toast={toast.show} />}
      {measure && <MeasureForm key={measure === 'new' ? 'new' : measure.id} goal={goal} steps={steps} ms={ms} edit={measure === 'new' ? undefined : measure}
        onClose={() => setMeasure(null)} toast={toast.show} />}
      {toast.node}
    </div>
  );
}

// ───────────── График замеров ─────────────

function niceStep(max: number) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
}

function Chart({ goal, ms, nextTh, w = 554, h = 220 }: { goal: Goal; ms: GoalMeasurement[]; nextTh: number | null; w?: number; h?: number }) {
  const [tip, setTip] = useState<number | null>(null);
  const W = w, X0 = 64, X1 = w - 18, Y0 = h - 40, YT = 20;
  const maxV = Math.max(1, ...ms.map((m) => m.value), nextTh ?? 0);
  const step = niceStep(maxV);
  const top = Math.ceil(maxV / step) * step;
  const Y = (v: number) => Y0 - (v / top) * (Y0 - YT);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const n = ms.length;
  const pts = ms.map((m, i) => ({ x: n === 1 ? (X0 + X1) / 2 : X0 + 26 + i * ((X1 - X0 - 52) / (n - 1)), y: Y(m.value), m }));
  const t = tip !== null ? pts[tip] : null;
  return (
    <section aria-label="График замеров" className="gchart">
      <div className="sec-head"><h2>Замеры</h2><span>{goal.metric} · пунктир — следующая ступень</span></div>
      <div className="plot" style={{ width: W, height: h }}>
        <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} fill="none" role="img" aria-label="График замеров">
          {ticks.map((v) => (
            <g key={v}><line x1={X0} y1={Y(v)} x2={X1} y2={Y(v)} stroke="#ECEEE8" />
              <text x={56} y={Y(v) + 4} textAnchor="end" className="ax">{fmtNum(v)}</text></g>
          ))}
          <line x1={X0} y1={12} x2={X0} y2={Y0} stroke="#BFC3BA" />
          <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke="#BFC3BA" />
          {nextTh !== null && (
            <><line x1={X0} y1={Y(nextTh)} x2={X1} y2={Y(nextTh)} stroke="#3D6A00" strokeWidth={1.2} strokeDasharray="4 5" />
              <text x={X1 - 2} y={Y(nextTh) - 6} textAnchor="end" className="ax step">ступень {fmtNum(nextTh)}</text></>
          )}
          {n > 1 && <path d={pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ')} stroke="#3D6A00" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
          {pts.map((p, i) => (
            <g key={p.m.id}>
              <line x1={p.x} y1={Y0} x2={p.x} y2={Y0 + 5} stroke="#BFC3BA" />
              {(n <= (w < 400 ? 5 : 8) || i % Math.ceil(n / (w < 400 ? 5 : 8)) === 0 || i === n - 1) && <text x={p.x} y={Y0 + 20} textAnchor="middle" className="ax dt">{shortDate(p.m.date)}</text>}
              <circle cx={p.x} cy={p.y} r={tip === i ? 6 : 4.5} fill={tip === i ? '#C5F25A' : '#FFFFFF'} stroke="#3D6A00" strokeWidth={2} />
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} />
            </g>
          ))}
          {n === 0 && <text x={(X0 + X1) / 2} y={110} textAnchor="middle" className="ax">замеров пока нет</text>}
        </svg>
        {t && (
          <div role="tooltip" className="ctip" style={{ left: Math.min(W - 210, Math.max(8, t.x - 100)), top: Math.max(4, t.y - 92) }}>
            <span className="d">{shortDate(t.m.date)}</span>
            <span className="v">{fmtNum(t.m.value)} <span>{goal.metric}</span></span>
            <span className="c">{t.m.comment || 'без комментария'}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────── Форма цели ─────────────

type DraftStep = { id: string; isNew: boolean; title: string; threshold: string; calc: GoalStep['calc']; taken_at: string | null; taken_manual: boolean };
/** Ввод числа: только цифры и одна запятая; целая часть сразу с пробелами по тысячам. */
const numIn = (s: string) => {
  const t = s.replace(/[^\d,.]/g, '').replace('.', ',');
  const [int, ...rest] = t.split(',');
  const head = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return rest.length ? `${head},${rest.join('').slice(0, 2)}` : head;
};
const fmtIn = (s: string) => { const v = parseNum(s); return v === null ? s : fmtNum(v); };

function GoalForm({ goal, onClose, toast }: { goal?: Goal; onClose: (createdId?: string) => void; toast: (t: Toast) => void }) {
  const store = useStore();
  const today = useToday();
  const isNew = !goal;
  const [title, setTitle] = useState(goal?.title ?? '');
  const [metric, setMetric] = useState(goal?.metric ?? '');
  const [calc, setCalc] = useState<GoalCalc>(goal?.calc ?? 'once');
  const [periodN, setPeriodN] = useState(String(goal?.period_n ?? 3));
  const [unit, setUnit] = useState<PeriodUnit>(goal?.period_unit ?? 'month');
  const [start, setStart] = useState(goal ? fmtNum(goal.start_value) : '');
  const [target, setTarget] = useState(goal ? fmtNum(goal.target_value) : '');
  const [criterion, setCriterion] = useState(goal?.criterion ?? '');
  const [due, setDue] = useState<string | null>(goal?.due_date ?? null);
  const [review, setReview] = useState<string | null>(goal?.review_date ?? shiftBack(today, -3, 'month'));
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'active');
  const [steps, setSteps] = useState<DraftStep[]>(() => sortedSteps(store.goal_steps.filter((s) => s.goal_id === goal?.id)).map((s) => ({
    id: s.id, isNew: false, title: s.title, threshold: fmtNum(s.threshold), calc: s.calc, taken_at: s.taken_at, taken_manual: s.taken_manual,
  })));
  const [cal, setCal] = useState<{ which: 'due' | 'review' | 'step'; anchor: Anchor; stepId?: string } | null>(null);
  const [info, setInfo] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const ok = title.trim() && parseNum(target) !== null;
  const phone = useIsPhone();
  const [stepEdit, setStepEdit] = useState<{ id: string; snapshot: DraftStep } | null>(null);
  const [touchDrag, setTouchDrag] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !cal) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cal, onClose]);

  const save = () => {
    if (!ok) return;
    const fields = {
      title: title.trim(), metric: metric.trim(), calc, period_n: Math.max(1, parseInt(periodN, 10) || 3), period_unit: unit,
      start_value: parseNum(start) ?? 0, target_value: parseNum(target)!, criterion: criterion.trim(), due_date: due, review_date: review,
      status, achieved_at: status === 'achieved' ? (goal?.achieved_at ?? today) : null,
    };
    let gid = goal?.id;
    if (isNew) gid = store.insert('goals', { ...fields, sort_order: Math.max(0, ...store.goals.map((g) => g.sort_order)) + 1 }).id;
    else store.patch('goals', gid!, fields);
    // Ступени: новая цель без ступеней — одна ступень «цель» на целевом значении (последняя ступень = цель).
    let list = steps.filter((s) => parseNum(s.threshold) !== null);
    if (isNew && list.length === 0) list = [{ id: crypto.randomUUID(), isNew: true, title: '', threshold: target, calc: 'goal', taken_at: null, taken_manual: false }];
    const keep = new Set(list.map((s) => s.id));
    for (const old of store.goal_steps.filter((s) => s.goal_id === gid && !keep.has(s.id))) store.remove('goal_steps', old.id);
    list.forEach((s, i) => {
      const row = { title: s.title.trim(), threshold: parseNum(s.threshold)!, calc: s.calc, taken_at: s.taken_at, taken_manual: s.taken_manual, sort_order: i };
      if (s.isNew) store.insert('goal_steps', { id: s.id, goal_id: gid!, ...row });
      else store.patch('goal_steps', s.id, row);
    });
    onClose(isNew ? gid : undefined);
  };

  const patchStep = (id: string, ch: Partial<DraftStep>) => setSteps((l) => l.map((s) => (s.id === id ? { ...s, ...ch } : s)));
  const removeStep = (s: DraftStep) => {
    const idx = steps.indexOf(s);
    setSteps((l) => l.filter((x) => x.id !== s.id));
    toast({ kind: 'deleted', text: `Ступень «${s.title || s.threshold || 'без названия'}» удалена`, undo: () => setSteps((l) => [...l.slice(0, idx), s, ...l.slice(idx)]) });
  };
  const addStep = () => { const id = crypto.randomUUID(); setSteps((l) => [...l, { id, isNew: true, title: '', threshold: '', calc: 'goal', taken_at: null, taken_manual: false }]); setFocusId(id); };
  const onDrop = (overId: string) => {
    const from = drag.current; drag.current = null;
    if (!from || from === overId) return;
    setSteps((l) => { const a = [...l]; const i = a.findIndex((x) => x.id === from); const [m] = a.splice(i, 1); a.splice(a.findIndex((x) => x.id === overId), 0, m); return a; });
  };

  return (
    <div className={'modal-scrim top' + (phone ? ' sheet-mode' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="gf-t" className={'modal goal-form' + (phone ? ' sheet' : '')}>
        {phone ? (
          <div className="sheet-bar">
            <button type="button" className="sb-cancel" onClick={() => onClose()}>Отменить</button>
            <h2 id="gf-t">{isNew ? 'Новая цель' : 'Изменить цель'}</h2>
            <button type="button" className="sb-done" disabled={!ok} onClick={save}>Готово</button>
          </div>
        ) : <h2 id="gf-t">{isNew ? 'Новая цель' : 'Изменить цель'}</h2>}
        <div className="gf-grid">
          <label className="full">Название<input className="big" value={title} autoFocus={isNew} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="full">Метрика<input value={metric} placeholder="подписчики, ₽ с контента/мес, книги" onChange={(e) => setMetric(e.target.value)} /></label>
          <span className="fld">
            <span className="lbl">Как считаем<button type="button" className={'info-i' + (info ? ' on' : '')} aria-label="Как считаем — пояснение" aria-expanded={info} onClick={() => setInfo((v) => !v)}>i</button></span>
            <span role="radiogroup" aria-label="Как считаем" className="radios">
              {(['once', 'average'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={calc === c} className={'radio' + (calc === c ? ' on' : '')} onClick={() => setCalc(c)}>
                  <span className="dot" />{c === 'once' ? 'Один раз' : 'Среднее за период'}</button>
              ))}
            </span>
            {info && <CalcInfo />}
          </span>
          <span className="fld">Период
            <span className="per">
              <input className="pn" inputMode="numeric" aria-label="Период, число" value={periodN} onChange={(e) => setPeriodN(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              <Select label="Единица периода" value={unit} onChange={setUnit}
                options={[{ value: 'week', label: plural(parseInt(periodN, 10) || 3, 'неделя', 'недели', 'недель') }, { value: 'month', label: plural(parseInt(periodN, 10) || 3, 'месяц', 'месяца', 'месяцев') }]} />
            </span>
            <span className="hint">по нему считается темп и среднее</span>
          </span>
          <label>Старт<input inputMode="decimal" value={start} onChange={(e) => setStart(numIn(e.target.value))} onBlur={() => setStart(fmtIn(start))} /></label>
          <label>Цель<input inputMode="decimal" value={target} onChange={(e) => setTarget(numIn(e.target.value))} onBlur={() => setTarget(fmtIn(target))} /></label>
          <label className="full">Критерий<textarea rows={2} value={criterion} onChange={(e) => setCriterion(e.target.value)} /></label>
          <span className="fld">Ориентировочный срок · необязательно
            <button type="button" className="date-btn" aria-haspopup="dialog" onClick={(e) => setCal({ which: 'due', anchor: e.currentTarget })}><Icon name="when" size={15} color="#3E423C" />{due ? fmtDate(due) : 'без срока'}</button></span>
          <span className="fld">Дата пересмотра
            <button type="button" className="date-btn" aria-haspopup="dialog" onClick={(e) => setCal({ which: 'review', anchor: e.currentTarget })}><Icon name="when" size={15} color="#3E423C" />{review ? fmtDate(review) : 'не задана'}</button></span>
          <span className="fld full">Статус
            <span className="statuses">{STATUS_ORDER.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} className={'gst big ' + s + (status === s ? ' on' : '')} onClick={() => setStatus(s)}>{STATUS[s]}</button>
            ))}</span></span>
        </div>

        <div className="gf-steps">
          <div className="sec-head"><h3>Ступени</h3><span>⋮⋮ — порядок · статус ставится сам, здесь — ручная правка</span></div>
          {!phone && <div className="gf-row head"><span /><span>Название</span><span>Порог</span><span className="lbl">Как считаем</span><span>Статус</span><span /></div>}
          {phone && steps.map((s) => (
            <div key={s.id} className={'pgf-step' + (touchDrag === s.id ? ' dragging' : '')}>
              <span className="grip" aria-label="Порядок — потяните" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setTouchDrag(s.id); }}
                onPointerMove={(e) => {
                  if (touchDrag !== s.id) return;
                  // Палец над серединой соседней строки — меняем местами.
                  const rows = [...document.querySelectorAll<HTMLElement>('.pgf-step')];
                  const i = steps.findIndex((x) => x.id === s.id);
                  const over = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return e.clientY >= b.top && e.clientY <= b.bottom; });
                  if (over < 0 || over === i) return;
                  const mid = rows[over].getBoundingClientRect(); const c = (mid.top + mid.bottom) / 2;
                  if ((over > i && e.clientY < c) || (over < i && e.clientY > c)) return;
                  setSteps((l) => { const arr = [...l]; const [m] = arr.splice(i, 1); arr.splice(over, 0, m); return arr; });
                }}
                onPointerUp={() => setTouchDrag(null)} onPointerCancel={() => setTouchDrag(null)}>
                <Icon name="grip" size={14} color="#8E9289" width={3} /></span>
              <button type="button" className="body" onClick={() => setStepEdit({ id: s.id, snapshot: s })}>
                <b>{s.title || s.threshold || 'Новая ступень'}</b>
                <span>порог {s.threshold || '—'} · {s.calc === 'goal' ? 'как у цели' : s.calc === 'once' ? 'один раз' : 'среднее за период'}</span>
              </button>
              <button type="button" aria-pressed={!!s.taken_at} className={'st-toggle' + (s.taken_at ? ' on' : '')}
                onClick={() => patchStep(s.id, s.taken_at ? { taken_at: null, taken_manual: true } : { taken_at: today, taken_manual: true })}>
                {s.taken_at ? `взята · ${shortDate(s.taken_at)}` : 'не взята'}</button>
            </div>
          ))}
          {!phone && steps.map((s) => (
            <div key={s.id} className="gf-row" onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(s.id)}>
              <span className="grip" draggable onDragStart={() => { drag.current = s.id; }} title="Перетащите, чтобы изменить порядок" aria-label="Порядок"><Icon name="grip" size={14} color="#8E9289" width={3} /></span>
              <input value={s.title} placeholder={parseNum(s.threshold) !== null ? s.threshold : 'Название ступени'} aria-label="Название ступени" autoFocus={focusId === s.id} className={focusId === s.id && !s.title ? 'fresh' : ''}
                onChange={(e) => patchStep(s.id, { title: e.target.value })} />
              <input inputMode="decimal" value={s.threshold} placeholder="порог" aria-label="Порог"
                onChange={(e) => patchStep(s.id, { threshold: numIn(e.target.value) })} onBlur={() => patchStep(s.id, { threshold: fmtIn(s.threshold) })} />
              <Select small label="Как считаем ступень" value={s.calc} minWidth={150} note="Период — тот, что задан у цели"
                options={[{ value: 'goal', label: 'как у цели' }, { value: 'once', label: 'один раз' }, { value: 'average', label: 'среднее за период цели' }]}
                onChange={(v) => patchStep(s.id, { calc: v })} />
              <button type="button" aria-pressed={!!s.taken_at} className={'st-toggle' + (s.taken_at ? ' on' : '')}
                onClick={() => patchStep(s.id, s.taken_at ? { taken_at: null, taken_manual: true } : { taken_at: today, taken_manual: true })}>
                {s.taken_at ? `взята · ${shortDate(s.taken_at)}` : 'не взята'}</button>
              <button type="button" className="trash" aria-label="Удалить ступень" title="Удалить ступень" onClick={() => removeStep(s)}><Icon name="trash" size={16} color="#8E9289" width={1.9} /></button>
            </div>
          ))}
          <button type="button" className="add-step" onClick={() => {
            if (!phone) { addStep(); return; }
            const id = crypto.randomUUID(); const blank: DraftStep = { id, isNew: true, title: '', threshold: '', calc: 'goal', taken_at: null, taken_manual: false };
            setSteps((l) => [...l, blank]); setStepEdit({ id, snapshot: blank });
          }}>+ Добавить ступень</button>
        </div>

        <div className="gf-foot">
          <span>Отменить цель — не поражение: статус «отменена», без последствий.</span>
          {!phone && <button type="button" className="btn-ghost" onClick={() => onClose()}>Отменить</button>}
          {!phone && <button type="button" className="btn-lime" disabled={!ok} onClick={save}>{isNew ? 'Создать' : 'Сохранить'}</button>}
        </div>
        {stepEdit && (() => {
          const st = steps.find((x) => x.id === stepEdit.id);
          if (!st) return null;
          const close = (keep: boolean) => {
            if (!keep) setSteps((l) => (stepEdit.snapshot.isNew && !stepEdit.snapshot.threshold && l.find((x) => x.id === st.id)?.threshold === ''
              ? l.filter((x) => x.id !== st.id) : l.map((x) => (x.id === st.id ? stepEdit.snapshot : x))));
            else if (!parseNum(st.threshold) && st.isNew) setSteps((l) => l.filter((x) => x.id !== st.id));
            setStepEdit(null);
          };
          return (
            <BottomSheet label="Ступень" onClose={() => close(false)}>
              <div className="sheet-bar">
                <button type="button" className="sb-cancel" onClick={() => close(false)}>Отменить</button>
                <h2>{stepEdit.snapshot.isNew ? 'Новая ступень' : 'Ступень'}</h2>
                <button type="button" className="sb-done" onClick={() => close(true)}>Готово</button>
              </div>
              <div className="prows">
                <label className="prow"><span>Название</span><input value={st.title} placeholder={st.threshold || 'Название ступени'} onChange={(e) => patchStep(st.id, { title: e.target.value })} /></label>
                <label className="prow"><span>Порог</span><input inputMode="decimal" className="num" value={st.threshold} placeholder="0" autoFocus={stepEdit.snapshot.isNew}
                  onChange={(e) => patchStep(st.id, { threshold: numIn(e.target.value) })} /></label>
                <div className="prow"><span>Как считаем</span>
                  <Select label="Как считаем ступень" value={st.calc} width={190} note="Период — тот, что задан у цели"
                    options={[{ value: 'goal', label: 'как у цели' }, { value: 'once', label: 'один раз' }, { value: 'average', label: 'среднее за период цели' }]}
                    onChange={(v) => patchStep(st.id, { calc: v })} /></div>
                <div className="prow"><span>Статус</span>
                  <span className="set-seg sm">
                    <button type="button" aria-pressed={!!st.taken_at} onClick={() => !st.taken_at && patchStep(st.id, { taken_at: today, taken_manual: true })}>Взята</button>
                    <button type="button" aria-pressed={!st.taken_at} onClick={() => st.taken_at && patchStep(st.id, { taken_at: null, taken_manual: true })}>Не взята</button>
                  </span></div>
                {st.taken_at && <button type="button" className="prow" onClick={(e) => setCal({ which: 'step', anchor: e.currentTarget, stepId: st.id })}>
                  <span>Дата</span><span className="v">{fmtDate(st.taken_at)}<Icon name="chevronRight" size={14} color="#8E9289" width={2.2} /></span></button>}
              </div>
              {!stepEdit.snapshot.isNew && (
                <button type="button" className="sheet-del" onClick={() => { setStepEdit(null); removeStep(st); }}>
                  <Icon name="trash" size={16} color="#5F635C" width={1.9} />Удалить ступень</button>
              )}
              <CalcInfoInline />
            </BottomSheet>
          );
        })()}
        {cal && (
          <DatePicker anchor={cal.anchor} title={cal.which === 'due' ? 'Ориентировочный срок' : cal.which === 'review' ? 'Дата пересмотра' : 'Ступень взята'}
            value={cal.which === 'due' ? due : cal.which === 'review' ? review : steps.find((x) => x.id === cal.stepId)?.taken_at ?? today}
            clearLabel={cal.which === 'due' ? 'Убрать срок' : undefined}
            onPick={(d) => (cal.which === 'due' ? setDue(d) : cal.which === 'review' ? setReview(d ?? review) : d && patchStep(cal.stepId!, { taken_at: d, taken_manual: true }))}
            onClose={() => setCal(null)} />
        )}
      </div>
    </div>
  );
}

/** Пояснение «Как считаем» в листе ступени (iPhone). */
function CalcInfoInline() {
  return <span className="sheet-note">Один раз — ступень взята, как только замер дошёл до порога. Среднее — среднее замеров за период цели не ниже порога.</span>;
}

function CalcInfo() {
  return (
    <div role="tooltip" className="calc-info">
      <span><b>Один раз</b> — ступень взята, как только замер дошёл до порога.</span>
      <span><b>Среднее за период</b> — период задан у цели; защита от случайности: доход 25 000 в одном месяце и 5 000 в остальных — по «один раз» ступень 20 000 взята, по «среднему за период» (3 месяца) — нет, ты ещё не стабильно там.</span>
    </div>
  );
}

// ───────────── Форма замера ─────────────

/**
 * Новый замер или правка существующего (клик по строке таблицы).
 * Правка: ступени проверяются заново по новому значению; правка вниз и удаление взятые ступени не снимают — их снимают вручную в форме цели.
 */
function MeasureForm({ goal, steps, ms, edit, onClose, toast }: {
  goal: Goal; steps: GoalStep[]; ms: GoalMeasurement[]; edit?: GoalMeasurement; onClose: () => void; toast: (t: Toast) => void;
}) {
  const store = useStore();
  const today = useToday();
  const [date, setDate] = useState(edit?.date ?? today);
  const [value, setValue] = useState(edit ? fmtNum(edit.value) : '');
  const [comment, setComment] = useState(edit?.comment ?? '');
  const [cal, setCal] = useState<Anchor | null>(null);
  const phone = useIsPhone();
  const v = parseNum(value);
  const others = edit ? ms.filter((m) => m.id !== edit.id) : ms;
  const draft = v === null ? null : { id: edit?.id ?? 'draft', goal_id: goal.id, date, value: v, comment: '', deleted_at: null };
  const hint = draft ? stepsTakenBy(goal, steps, [...others, draft], draft) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !cal) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cal, onClose]);

  const rule = (s: GoalStep) => {
    if (stepRule(s, goal) === 'once') return `${fmtNum(v!)} не меньше порога ${fmtNum(s.threshold)} · правило «один раз»`;
    const avg = averageAt(goal, [...others, draft!], date);
    return `среднее за ${periodShort(goal.period_n, goal.period_unit)} — ${fmtNum(avg ?? 0)}, не меньше порога ${fmtNum(s.threshold)} · правило «среднее за период»`;
  };

  const save = () => {
    if (v === null) return;
    const fields = { date, value: v, comment: comment.trim() };
    let m: GoalMeasurement;
    if (edit) { store.patch('goal_measurements', edit.id, fields); m = { ...edit, ...fields }; }
    else m = store.insert('goal_measurements', { goal_id: goal.id, ...fields });
    const all = [...others, m];
    const taken = stepsTakenBy(goal, steps, all, m);
    for (const s of taken.steps) { store.patch('goal_steps', s.id, { taken_at: date, taken_manual: false }); auraSteps.set(s.id, today); }
    if (taken.last) {
      const list = sortedSteps(steps);
      const nxt = list.find((s) => !s.taken_at && !taken.steps.includes(s));
      const name = stepName(taken.last, list[list.length - 1]?.id === taken.last.id);
      toast({ kind: 'step', title: `«${name}»${taken.more ? ` + ещё ${taken.more}` : ''}`,
        sub: nxt ? `следующая — ${fmtNum(nxt.threshold)}, осталось ${fmtNum(Math.max(0, nxt.threshold - v))}` : 'все ступени взяты' });
    }
    onClose();
  };

  const del = () => { onClose(); store.withUndo(`Замер ${shortDate(edit!.date)} удалён`, () => store.remove('goal_measurements', edit!.id)); };
  const hintNode = hint?.last && (
    <div role="note" className="mf-hint">
      <span className="ico"><Trophy size={15} color="#C5F25A" /></span>
      <span className="tx"><b>Ступень «{stepName(hint.last, false)}» будет взята{hint.more ? ` + ещё ${hint.more}` : ''}</b><span>{rule(hint.last)}</span></span>
    </div>
  );
  if (phone) {
    // iPhone: белый нижний лист «Отменить · Новый замер · Сохранить» (Спецификация, раздел 16).
    return (
      <BottomSheet label={edit ? 'Замер' : 'Новый замер'} onClose={onClose}>
        <div className="sheet-bar">
          <button type="button" className="sb-cancel" onClick={onClose}>Отменить</button>
          <h2>{edit ? 'Замер' : 'Новый замер'}</h2>
          <button type="button" className="sb-done" disabled={v === null} onClick={save}>Сохранить</button>
        </div>
        <div className="prows">
          <button type="button" className="prow" onClick={(e) => setCal(e.currentTarget)}><span>Дата</span><span className="v">{fmtDate(date)}<Icon name="chevronRight" size={14} color="#8E9289" width={2.2} /></span></button>
          <label className="prow"><span>Значение{goal.metric ? ` · ${goal.metric}` : ''}</span><input className="num" inputMode="decimal" autoFocus={!edit} value={value}
            onChange={(e) => setValue(numIn(e.target.value))} onBlur={() => setValue(fmtIn(value))} /></label>
          <label className="prow col"><span>Комментарий</span><textarea rows={2} value={comment} placeholder="необязательно" onChange={(e) => setComment(e.target.value)} /></label>
        </div>
        {hintNode}
        {edit && <button type="button" className="sheet-del" onClick={del}><Icon name="trash" size={16} color="#5F635C" width={1.9} />Удалить замер</button>}
        {cal && <DatePicker anchor={cal} title="Дата замера" value={date} onPick={(d) => d && setDate(d)} onClose={() => setCal(null)} />}
      </BottomSheet>
    );
  }

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="gm-t" className="modal measure-form">
        <div className="mf-head"><h2 id="gm-t">{edit ? 'Замер' : 'Новый замер'}</h2><span>{goal.title} · {goal.metric}</span></div>
        <div className="mf-grid">
          <span className="fld">Дата<button type="button" className="date-btn" aria-haspopup="dialog" onClick={(e) => setCal(e.currentTarget)}><Icon name="when" size={15} color="#3E423C" />{fmtDate(date)}</button></span>
          <label>Значение{goal.metric ? ` · ${goal.metric}` : ''}<input className="val" inputMode="decimal" autoFocus={!edit} value={value}
            onChange={(e) => setValue(numIn(e.target.value))} onBlur={() => setValue(fmtIn(value))}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></label>
          <label className="full">Комментарий · необязательно<textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        </div>
        {hint?.last && (
          <div role="note" className="mf-hint">
            <span className="ico"><Trophy size={15} color="#C5F25A" /></span>
            <span className="tx"><b>Ступень «{stepName(hint.last, false)}» будет взята{hint.more ? ` + ещё ${hint.more}` : ''}</b><span>{rule(hint.last)}</span></span>
          </div>
        )}
        <div className="mf-foot">
          {edit && (
            <button type="button" className="btn-ghost del" onClick={() => {
              onClose();
              store.withUndo(`Замер ${shortDate(edit.date)} удалён`, () => store.remove('goal_measurements', edit.id));
            }}><Icon name="trash" size={16} color="#5F635C" width={1.9} />Удалить</button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Отменить</button>
          <button type="button" className="btn-lime" disabled={v === null} onClick={save}>Сохранить замер</button>
        </div>
        {cal && <DatePicker anchor={cal} title="Дата замера" value={date} onPick={(d) => d && setDate(d)} onClose={() => setCal(null)} />}
      </div>
    </div>
  );
}

