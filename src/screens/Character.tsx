import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, useToday } from '../lib/store';
import { badgeOn, characterStats, questCards, type CharacterStats, type QuestCard, type SkillStat } from '../lib/growth/growth';
import { treeLayout, treeSig, type TreeBranchInput, type TreeGeom, type TreeNodePos } from '../lib/growth/treeLayout';
import { branchName, daysText, fmtH } from '../lib/growth/format';
import { fmtNum, leftText, nextStepLeft, sortedMeasurements, sortedSteps } from '../lib/growth/goals';
import { shortDate } from '../lib/dates';
import type { Goal, Skill } from '../lib/types';
import { Icon } from '../ui/icons';
import { SKILL_ICONS } from '../ui/skillIcons';
import { useIsPhone } from '../ui/useIsPhone';

const CHARACTER_IMG = `${import.meta.env.BASE_URL}character.png`;
const RING_C = 2 * Math.PI * 28;
const iconOf = (s: Skill | undefined) => (s && SKILL_ICONS[s.icon]) || SKILL_ICONS.target || '';

/** «Персонаж» на Mac (15_ТЗ, п. 5; холст — ряд «Персонаж», Спецификация, раздел 10). */
export function CharacterScreen() {
  const store = useStore();
  const today = useToday();
  const { tasks, projects, skills, goals, goal_steps, goal_measurements, settings } = store;
  const data = useMemo(() => ({ tasks, projects, skills }), [tasks, projects, skills]);
  const stats = useMemo(() => characterStats(data, today), [data, today]);
  const quests = useMemo(() => questCards(data, today), [data, today]);

  // Открыл раздел — точка гаснет; выросло, пока раздел открыт, — тоже гасим.
  const dot = useMemo(() => badgeOn(data, settings.character_seen_at), [data, settings.character_seen_at]);
  const seenOnce = useRef(false);
  useEffect(() => {
    if (!seenOnce.current || dot) store.patchSettings({ character_seen_at: new Date().toISOString() });
    seenOnce.current = true;
  }, [dot]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeGoals = goals.filter((g) => g.status === 'active').sort((a, b) => a.sort_order - b.sort_order);
  const phone = useIsPhone();

  return (
    <div className="char-page">
      {phone ? <PhoneCharacterTop stats={stats} quests={quests.cards} /> : <section className="char-tree-card" aria-label="Дерево навыков">
        <div className="char-head">
          <h1>Персонаж</h1>
          <div className="char-legend">
            <span><span className="lg-aura" />новый уровень</span>
            <span><span className="plus-chip">+0:45</span>сегодня</span>
            <span><span className="lg-locked" />не открыт</span>
          </div>
        </div>
        <SkillTree stats={stats} quests={quests.cards} />
      </section>}

      <section className="char-section" aria-label="Сайд-квесты">
        <div className="char-sec-head">
          <h2>Сайд-квесты</h2>
          <span>{quests.cards.length ? `${quests.cards.length} из 3 активны` : 'нет активных'}</span>
        </div>
        {quests.tooMany && (
          <div className="warn-note" role="note">
            <Icon name="warn" size={14} color="#8A5A00" width={2.2} />
            Активных квестов {quests.cards.length} — договорились о трёх
          </div>
        )}
        {quests.cards.length > 0 ? (
          <div className="card-grid">{quests.cards.map((q) => <QuestCardView key={q.id} q={q} />)}</div>
        ) : (
          <EmptyBlock icon="quest" title="Активных квестов нет"
            hint="Квест — проект с флажком «Квест»: большая цель на 1–4 недели. Отметь проект квестом в его меню «…» — он появится здесь. Договорились не больше трёх." />
        )}
      </section>

      <section className="char-section" aria-label="Цели">
        <div className="char-sec-head"><h2>Цели</h2><span>активные · {activeGoals.length}</span></div>
        {activeGoals.length > 0 ? (
          <div className="card-grid">
            {activeGoals.map((g) => (
              <GoalCardView key={g.id} goal={g}
                steps={goal_steps.filter((s) => s.goal_id === g.id)}
                ms={goal_measurements.filter((m) => m.goal_id === g.id)} />
            ))}
          </div>
        ) : (
          <EmptyBlock icon="trophy" title="Активных целей нет"
            hint="Цель меряется замерами — подписчики, доход, книги — и ведёт к себе ступенями."
            action={<Link to="/goals?new=1" className="btn-lime">Новая цель</Link>} />
        )}
      </section>
    </div>
  );
}

// ───────────── Дерево ─────────────

/** Ветки и видимые навыки по порядку из Настроек (скрытые и удалённые на дереве не рисуются). */
function treeInput(skills: Skill[], stats: CharacterStats): TreeBranchInput[] {
  return stats.branches.map((b) => ({
    key: b.key,
    skills: skills.filter((s) => s.branch === b.key && s.active && !s.deleted_at).sort((x, y) => x.sort_order - y.sort_order).map((s) => s.id),
  })).filter((b) => b.skills.length > 0);
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const mixNodes = (a: Record<string, TreeNodePos>, b: Record<string, TreeNodePos>, t: number) => {
  const out: Record<string, TreeNodePos> = {};
  for (const [id, n] of Object.entries(b)) {
    const o = a[id];
    out[id] = o ? { ...n, x: o.x + (n.x - o.x) * t, y: o.y + (n.y - o.y) * t } : n;
  }
  return out;
};

/**
 * Застывшая раскладка: та же подпись набора навыков — берём сохранённые позиции;
 * изменился набор (добавили, скрыли, удалили) — считаем заново, плавно переезжаем 0,6 с и сохраняем.
 */
function useFrozenLayout(input: TreeBranchInput[]): TreeGeom {
  const store = useStore();
  const saved = store.settings.tree_layout;
  const target = useMemo(() => treeLayout(input), [treeSig(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = !saved || saved.sig !== target.sig;
  const [shown, setShown] = useState<TreeGeom>(() => {
    // Набор изменился — первый кадр на старых местах, дальше переезд (новый узел сразу на своём месте).
    if (!saved) return target;
    const nodes = Object.fromEntries(Object.entries(target.nodes).map(([id, n]) => [id, { ...n, x: saved.nodes[id]?.[0] ?? n.x, y: saved.nodes[id]?.[1] ?? n.y }]));
    return { ...target, nodes };
  });
  const from = useRef<TreeGeom>(shown);

  useEffect(() => {
    if (!fresh) return;
    const prevNodes: Record<string, TreeNodePos> = { ...from.current.nodes };
    if (saved) for (const [id, [x, y]] of Object.entries(saved.nodes)) if (prevNodes[id]) prevNodes[id] = { ...prevNodes[id], x, y };
    store.patchSettings({ tree_layout: { sig: target.sig, w: target.w, h: target.h,
      nodes: Object.fromEntries(Object.entries(target.nodes).map(([id, n]) => [id, [Math.round(n.x), Math.round(n.y)]])) } });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Object.keys(prevNodes).length) { setShown(target); from.current = target; return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setShown({ ...target, nodes: mixNodes(prevNodes, target.nodes, ease(t)) });
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target.sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return shown;
}

function SkillTree({ stats, quests }: { stats: CharacterStats; quests: QuestCard[] }) {
  const store = useStore();
  const input = treeInput(store.skills, stats);
  const geom = useFrozenLayout(input);
  const [focus, setFocus] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const focusKey = focus && geom.hubs.some((h) => h.key === focus) ? focus : geom.hubs[0]?.key;
  const byId = new Map(stats.skills.map((s) => [s.id, s]));
  const skillById = new Map(store.skills.map((s) => [s.id, s]));
  const questName = new Map(store.projects.map((p) => [p.id, p.name || 'Новый проект']));
  // «новый» — навык добавлен к уже растущему дереву и ещё без часов; стартовые навыки без часов — просто «не открыт».
  const firstDone = Math.min(...store.tasks.filter((t) => t.status === 'completed' && t.completed_at).map((t) => Date.parse(t.completed_at!)));
  const isNew = (s: Skill | undefined, st: SkillStat) => !st.opened && !!s?.created_at && Date.parse(s.created_at) > firstDone;

  const { cx, cy } = geom;
  const paths: { d: string; open: boolean; rank: number }[] = [];
  for (const h of geom.hubs) {
    const lit = h.key === focusKey;
    paths.push({ d: geom.hubs.length > 2 && h.side > 0
      ? `M${cx} ${cy} C${cx + 60} ${cy} ${h.x - 60} ${h.y} ${h.x} ${h.y}` : `M${cx} ${cy} L${h.x} ${h.y}`, open: true, rank: lit ? 2 : 1 });
  }
  for (const [id, n] of Object.entries(geom.nodes)) {
    const h = geom.hubs.find((x) => x.key === n.branch)!;
    const st = byId.get(id);
    paths.push({ d: `M${h.x} ${h.y} C${h.x + n.side * 30} ${h.y} ${n.x - n.side * 30} ${n.y} ${n.x} ${n.y}`,
      open: !!st?.opened, rank: st?.opened ? (n.branch === focusKey ? 2 : 1) : 0 });
  }
  paths.sort((a, b) => a.rank - b.rank);

  const tipSkill = tip ? byId.get(tip) : undefined;
  const tipNode = tip ? geom.nodes[tip] : undefined;

  return (
    <div className="tree-scroll">
      <div className="tree" style={{ width: geom.w, height: geom.h }}>
        <svg width={geom.w} height={geom.h} viewBox={`0 0 ${geom.w} ${geom.h}`} fill="none" aria-hidden="true" className="tree-svg">
          <ellipse cx={cx} cy={cy} rx={300} ry={Math.min(geom.h / 2 - 30, 330)} stroke="#EEF0EA" strokeWidth={1.5} strokeDasharray="3 7" />
          {paths.map((p, i) => p.open ? (
            <g key={i}>
              <path d={p.d} stroke={p.rank === 2 ? 'rgba(197,242,90,.55)' : 'rgba(197,242,90,.3)'} strokeWidth={p.rank === 2 ? 14 : 9} strokeLinecap="round" />
              <path d={p.d} stroke="#3D6A00" strokeWidth={p.rank === 2 ? 3 : 2} strokeLinecap="round" opacity={p.rank === 2 ? 1 : 0.4} />
            </g>
          ) : <path key={i} d={p.d} stroke="#DADCD5" strokeWidth={2} strokeDasharray="4 6" />)}
          {geom.hubs.map((h) => <circle key={h.key} cx={h.x} cy={h.y} r={6} fill="#3D6A00" />)}
        </svg>

        <div aria-hidden="true" className="char-glow" style={{ left: cx - 90, top: cy - 245 }} />
        <div aria-hidden="true" className="char-shadow" style={{ left: cx - 65, top: cy + 93 }} />
        <img src={CHARACTER_IMG} alt="Персонаж" className={'char-img' + (stats.total.aura ? ' aura' : '')} style={{ left: cx - 58, top: cy - 237 }} />
        <div className="char-level" style={{ left: cx - 105, top: cy + 125 }}>
          <span className="lv"><span>Уровень</span><b>{stats.total.info.level}</b></span>
          <div className="bar"><div style={{ width: `${Math.round(stats.total.info.progress * 100)}%` }} /></div>
          <span className="to">до {stats.total.info.level + 1} — <b>{fmtH(stats.total.info.toNext)}</b></span>
          <div className="pills">
            <Link to="/chapters" className="pill-mini">Главы · {stats.total.info.level}<Icon name="chevronRight" size={9} color="#5F635C" width={3} /></Link>
            <span className="pill-mini soon-pill" aria-disabled="true">очки · скоро</span>
          </div>
        </div>

        {geom.hubs.map((h) => {
          const b = stats.branches.find((x) => x.key === h.key)!;
          const sel = h.key === focusKey;
          return (
            <button key={h.key} type="button" aria-pressed={sel} className={'branch-chip' + (sel ? ' sel' : '') + (b.aura ? ' aura' : '')}
              style={{ left: h.chipX, top: h.chipY }} onClick={() => setFocus(h.key)}>
              {branchName(h.key)}
              <span className="lvl">ур. {b.info.level}</span>
              <span className="sub">до {b.info.level + 1} — <b>{fmtH(b.info.toNext)}</b></span>
            </button>
          );
        })}

        {Object.entries(geom.nodes).map(([id, n]) => {
          const st = byId.get(id);
          const sk = skillById.get(id);
          if (!st || !sk) return null;
          const fresh = isNew(sk, st);
          const left = n.side < 0;
          const small = n.d < 64;
          const lw = small ? 132 : 150;
          return (
            <div key={id} className={'tnode' + (left ? ' left' : '') + (small ? ' small' : '')}
              style={{ left: left ? n.x - n.d / 2 - 10 - lw : n.x - n.d / 2, top: n.y - n.d / 2, width: n.d + 10 + lw, height: n.d }}>
              <button type="button" className="tnode-ico" style={{ width: n.d, height: n.d }}
                aria-label={sk.name + (st.opened ? `, уровень ${st.info.level}, до следующего ${fmtH(st.info.toNext)}` : ', не открыт') + (st.todayMin ? `, сегодня +${fmtH(st.todayMin)}` : '')}
                onMouseEnter={() => setTip(id)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(id)} onBlur={() => setTip(null)}>
                {st.aura && <span className="node-aura" aria-hidden="true" />}
                {st.opened ? (
                  <>
                    <span className={'node-disc' + (st.aura ? ' aura' : '')} />
                    <svg width={n.d} height={n.d} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="node-ring">
                      <circle cx="32" cy="32" r="28" stroke="#EEF0EA" strokeWidth={4.5} />
                      {st.info.progress > 0 && <circle cx="32" cy="32" r="28" stroke={st.aura ? '#C5F25A' : '#3D6A00'} strokeWidth={4.5} strokeLinecap="round"
                        strokeDasharray={`${(st.info.progress * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`} />}
                    </svg>
                    <Glyph d={iconOf(sk)} size={Math.round(n.d * 0.4)} />
                    <span className={'node-badge' + (st.aura ? ' aura' : '')}>{st.info.level}</span>
                  </>
                ) : (
                  <>
                    <span className={'node-locked' + (fresh ? ' fresh' : '')} />
                    <Glyph d={iconOf(sk)} size={Math.round(n.d * 0.34)} color={fresh ? '#3D6A00' : '#8E9289'} />
                  </>
                )}
                {st.questIds.length > 0 && (
                  <span className="node-quest" aria-hidden="true"><Icon name="quest" size={12} color="#C5F25A" width={2.8} /></span>
                )}
              </button>
              <div className="tnode-label">
                <span className="tnode-name">
                  {st.todayMin > 0 && <span className="plus-chip">+{fmtH(st.todayMin)}</span>}
                  {fresh && <span className="new-chip">новый</span>}
                  <span className={'nm' + (st.opened ? '' : ' muted')}>{sk.name}</span>
                </span>
                <span className="tnode-sub">{st.opened ? <>до {st.info.level + 1} — <b>{fmtH(st.info.toNext)}</b></> : 'не открыт'}</span>
              </div>
            </div>
          );
        })}

        {tipSkill && tipNode && (
          <SkillTip st={tipSkill} name={skillById.get(tipSkill.id)?.name ?? ''}
            quests={quests.flatMap((q) => q.skills.filter((s) => s.id === tipSkill.id).map((s) => `Квест: ${questName.get(q.id)} · ${fmtH(s.minutes)}`))}
            left={tipNode.side < 0 ? tipNode.x + tipNode.d / 2 + 14 : tipNode.x - tipNode.d / 2 - 14 - 248}
            top={Math.max(40, Math.min(geom.h - 320, tipNode.y - 50))} />
        )}
      </div>
    </div>
  );
}

function SkillTip({ st, name, quests, left, top }: { st: SkillStat; name: string; quests: string[]; left: number; top: number }) {
  return (
    <div role="tooltip" className="skill-tip" style={{ left, top }}>
      <div className="row1"><span className="nm">{name}</span><span className="lvl">ур. {st.info.level}</span></div>
      <div className="main"><span>до уровня {st.info.level + 1}</span><b>{fmtH(st.info.toNext)}</b></div>
      <div className="bar"><div style={{ width: `${Math.round(st.info.progress * 100)}%` }} /></div>
      <div className="kv"><span>Всего часов</span><span>{fmtH(st.minutes)}</span></div>
      {st.todayMin > 0 && <div className="kv"><span>За сегодня</span><span className="lime">+{fmtH(st.todayMin)}</span></div>}
      {st.idleDays !== null && st.idleDays > 0 && <div className="kv"><span>Без роста</span><span>{daysText(st.idleDays)}</span></div>}
      {quests.length > 0 && (
        <div className="quests">
          {quests.map((q) => <span key={q}><Icon name="quest" size={14} color="#C5F25A" width={2.2} />{q}</span>)}
        </div>
      )}
    </div>
  );
}

function Glyph({ d, size, color = '#15171A' }: { d: string; size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ position: 'relative' }}>
      <path d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ───────────── Квесты и цели ─────────────

function QuestCardView({ q }: { q: QuestCard }) {
  const store = useStore();
  const p = store.projects.find((x) => x.id === q.id)!;
  const skills = new Map(store.skills.map((s) => [s.id, s]));
  const est = q.estimate;
  const over = q.over !== null;
  const done = est ? Math.min(1, q.minutes / est) : 0;
  return (
    <Link to={`/project/${q.id}`} className="qcard quest">
      <div className="qtitle"><Icon name="quest" size={15} color="#3D6A00" width={2.2} /><span>{p.name || 'Новый проект'}</span></div>
      <div className="qnum"><b>{fmtH(q.minutes)}</b><span>{est ? `из ${fmtH(est)}` : 'без оценки'}</span></div>
      {est ? (
        <div className="qbar"><div style={{ width: `${Math.round(done * 100)}%`,
          background: over ? `linear-gradient(90deg, #3D6A00 0 ${Math.round((est / q.minutes) * 100)}%, #E0A526 ${Math.round((est / q.minutes) * 100)}% 100%)` : '#3D6A00' }} /></div>
      ) : null}
      {over && <span className="over-chip"><Icon name="warn" size={12} color="#8A5A00" width={2.2} />+{fmtH(q.over!)} сверх оценки</span>}
      {q.skills.length > 0 && (
        <div className="qskills">
          {q.skills.map((s) => (
            <span key={s.id} title={`${skills.get(s.id)?.name ?? ''} ${fmtH(s.minutes)}`}>
              <Glyph d={iconOf(skills.get(s.id))} size={13} color="#3D6A00" />{fmtH(s.minutes)}
            </span>
          ))}
        </div>
      )}
      <div className="qfoot">
        {q.todayMin > 0 && <span className="plus-chip wide">+{fmtH(q.todayMin)} сегодня</span>}
        {q.days !== null && <span>идёт {daysText(q.days)}</span>}
      </div>
    </Link>
  );
}

function GoalCardView({ goal, steps, ms }: { goal: Goal; steps: Parameters<typeof sortedSteps>[0]; ms: Parameters<typeof sortedMeasurements>[0] }) {
  const list = sortedSteps(steps);
  const next = nextStepLeft(goal, steps, ms);
  const taken = list.filter((s) => s.taken_at).length;
  const nextIdx = next ? list.indexOf(next.step) : -1;
  const sm = sortedMeasurements(ms);
  const last = sm[sm.length - 1];
  return (
    <Link to={`/goals/${goal.id}`} className="qcard">
      <div className="qtitle"><Icon name="trophy" size={15} color="#3D6A00" width={2} /><span>{goal.title || 'Новая цель'}</span></div>
      {next ? (
        <div className="gnext">
          <span className="lbl">Следующая ступень</span>
          <span className="qnum"><b>{fmtNum(next.step.threshold)}</b><span>{next.left === null ? leftText(next) : <>осталось <strong>{fmtNum(Math.max(0, next.left))}</strong></>}</span></span>
        </div>
      ) : (
        <div className="gnext"><span className="lbl">{list.length ? 'Все ступени взяты' : 'Ступеней пока нет'}</span></div>
      )}
      {list.length > 0 && (
        <span className="gsegs">{list.map((s, i) => <span key={s.id} style={{ background: s.taken_at ? '#3D6A00' : i === nextIdx ? '#C5F25A' : '#E3E5DF' }} />)}</span>
      )}
      <div className="qfoot">
        {list.length > 0 && <span>{next ? `ступень ${nextIdx + 1} из ${list.length}` : `${taken} из ${list.length}`}</span>}
        {list.length > 0 && <span>·</span>}
        <span>{last ? `замер ${shortDate(last.date)}` : 'замеров нет'}</span>
      </div>
    </Link>
  );
}

function EmptyBlock({ icon, title, hint, action }: { icon: 'quest' | 'trophy'; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="empty-dashed">
      <span className="eb-ico"><Icon name={icon} size={18} color="#5F635C" width={2} /></span>
      <span className="eb-text"><span className="t">{title}</span><span className="h">{hint}</span></span>
      {action}
    </div>
  );
}

// ───────────── iPhone: список вместо дерева (Спецификация, раздел 14) ─────────────

function PhoneCharacterTop({ stats, quests }: { stats: CharacterStats; quests: QuestCard[] }) {
  const store = useStore();
  const [sheet, setSheet] = useState<string | null>(null);
  const skillById = new Map(store.skills.map((s) => [s.id, s]));
  const questName = new Map(store.projects.map((p) => [p.id, p.name || 'Новый проект']));
  const t = stats.total;
  const st = sheet ? stats.skills.find((x) => x.id === sheet) : undefined;
  return (
    <>
      <h1 className="phone-h1">Персонаж</h1>
      <section aria-label="Общий уровень" className="pc-level">
        <div className="pc-pic">
          <div className="glow" aria-hidden="true" />
          <div className="floor" aria-hidden="true" />
          <img src={CHARACTER_IMG} alt="Персонаж" />
        </div>
        <div className="pc-info">
          <span className="lv"><span>Уровень</span><b>{t.info.level}</b></span>
          <div className="bar"><div style={{ width: `${Math.round(t.info.progress * 100)}%` }} /></div>
          <span className="to">до {t.info.level + 1} — <b>{fmtH(t.info.toNext)}</b></span>
          <div className="pills">
            <Link to="/chapters" className="pill-mini lg">Главы · {t.info.level}<Icon name="chevronRight" size={10} color="#5F635C" width={3} /></Link>
            <span className="pill-mini lg soon-pill" aria-disabled="true">очки · скоро</span>
          </div>
        </div>
      </section>
      {stats.branches.map((b) => {
        const list = store.skills.filter((s) => s.branch === b.key && s.active && !s.deleted_at).sort((x, y) => x.sort_order - y.sort_order);
        if (!list.length) return null;
        return (
          <section key={b.key} aria-label={branchName(b.key)} className="pc-branch">
            <div className="pc-bhead">
              <span className="nm">{branchName(b.key)}</span>
              <span className={'chip' + (b.aura ? ' aura' : '')}>ур. {b.info.level}</span>
              <span className="to">до {b.info.level + 1} — <b>{fmtH(b.info.toNext)}</b></span>
            </div>
            {list.map((sk) => {
              const s = stats.skills.find((x) => x.id === sk.id)!;
              return (
                <button key={sk.id} type="button" className="pc-skill" onClick={() => setSheet(sk.id)}
                  aria-label={sk.name + (s.opened ? `, уровень ${s.info.level}, до следующего ${fmtH(s.info.toNext)}` : ', не открыт')}>
                  <SkillBadge s={s} sk={sk} size={44} />
                  <span className="tx">
                    <span className="r1"><span className={'nm' + (s.opened ? '' : ' muted')}>{sk.name}</span>{s.todayMin > 0 && <span className="plus-chip">+{fmtH(s.todayMin)}</span>}</span>
                    <span className="r2">{s.opened ? <>до {s.info.level + 1} — <b>{fmtH(s.info.toNext)}</b></> : 'не открыт'}</span>
                  </span>
                  <Icon name="chevronRight" size={14} color="#BFC3BA" width={2.4} />
                </button>
              );
            })}
          </section>
        );
      })}
      {st && (
        <BottomSheet label={`Навык ${skillById.get(st.id)?.name ?? ''}`} onClose={() => setSheet(null)}>
          <div className="ps-head">
            <SkillBadge s={st} sk={skillById.get(st.id)} size={48} sheet />
            <span className="t"><b>{skillById.get(st.id)?.name}</b><span>{branchName(st.branch)}</span></span>
            <span className="lvchip">ур. {st.info.level}</span>
          </div>
          <div className="ps-main">
            <span className="l">до уровня {st.info.level + 1}</span>
            <b>{fmtH(st.info.toNext)}</b>
            <div className="bar"><div style={{ width: `${Math.round(st.info.progress * 100)}%` }} /></div>
          </div>
          <div className="ps-rows">
            <span><span>Всего часов</span><b>{fmtH(st.minutes)}</b></span>
            {st.todayMin > 0 && <span><span>За сегодня</span><b className="g">+{fmtH(st.todayMin)}</b></span>}
            {st.idleDays !== null && st.idleDays > 0 && <span><span>Без роста</span><b>{daysText(st.idleDays)}</b></span>}
          </div>
          {quests.some((q) => q.skills.some((x) => x.id === st.id)) && (
            <div className="ps-quests">
              <span className="l">Квесты навыка</span>
              {quests.flatMap((q) => q.skills.filter((x) => x.id === st.id).map((x) => (
                <span key={q.id}><Icon name="quest" size={15} color="#3D6A00" width={2.2} />{questName.get(q.id)} · {fmtH(x.minutes)}</span>
              )))}
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}

function SkillBadge({ s, sk, size, sheet }: { s: SkillStat; sk: Skill | undefined; size: number; sheet?: boolean }) {
  const r = size === 44 ? 19 : 21;
  const c = 2 * Math.PI * r;
  return (
    <span className="pc-badge" style={{ width: size, height: size }}>
      {(s.aura || sheet) && s.opened && <span className={'aura' + (sheet && !s.aura ? ' soft' : '')} aria-hidden="true" />}
      {s.opened ? (
        <>
          <span className={'disc' + (s.aura ? ' on' : '')} />
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true" className="ring">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="#EEF0EA" strokeWidth={3.5} />
            {s.info.progress > 0 && <circle cx={size / 2} cy={size / 2} r={r} stroke={s.aura ? '#C5F25A' : '#3D6A00'} strokeWidth={3.5} strokeLinecap="round"
              strokeDasharray={`${(s.info.progress * c).toFixed(1)} ${c.toFixed(1)}`} />}
          </svg>
          <Glyph d={iconOf(sk)} size={19} />
          {!sheet && <span className={'lvl' + (s.aura ? ' on' : '')}>{s.info.level}</span>}
        </>
      ) : (
        <>
          <span className="locked" />
          <Glyph d={iconOf(sk)} size={17} color="#8E9289" />
        </>
      )}
      {!sheet && s.questIds.length > 0 && <span className="q" aria-hidden="true"><Icon name="quest" size={9} color="#C5F25A" width={3} /></span>}
    </span>
  );
}

/** Белый нижний лист (iPhone): ручка, закрытие тапом по затемнению или свайпом вниз. */
export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const start = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="wsheet-scrim" onClick={onClose}>
      <div className="wsheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { start.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (start.current !== null && e.changedTouches[0].clientY - start.current > 60) onClose(); start.current = null; }}>
        <span className="wsheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
