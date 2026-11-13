// Расчёты «Персонажа» (15_ТЗ, раздел 4): часы, уровни, «сегодня», моменты роста, главы, квесты, удаление навыка.
// Всё считается из задач в момент вызова, ничего не хранится. Функции чистые: данные и «сегодня» приходят параметрами.

import type { Project, Skill, Task } from '../types.ts';
import { addDays, iso, parseISO } from '../dates.ts';
import { levelInfo, minutesForLevel, type LevelInfo, type LevelKind } from './levels.ts';

export type GrowthData = { tasks: Task[]; projects: Project[]; skills: Skill[] };

/** Ветки: известные — в этом порядке, новые — следом, по порядку навыков. Ничего не зашито под «две ветки». */
const BRANCH_ORDER = ['creator', 'profession'];

// ───────────── Даты ─────────────

/** Локальный день устройства для момента времени. */
export const dayOf = (ts: string | number) => iso(new Date(ts));
/** Дней от a до b (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
const maxDay = (a: string, b: string) => (a > b ? a : b);

// ───────────── Часы ─────────────

/** Начисление часов одной выполненной задачей. */
export type Credit = {
  taskId: string; skillId: string; branch: string; projectId: string | null;
  minutes: number; at: number; day: string;
};

type Ctx = {
  data: GrowthData;
  skills: Map<string, Skill>;          // не удалённые
  projects: Map<string, Project>;      // не удалённые
  tasks: Map<string, Task>;
  credits: Credit[];                   // по времени
  done: Task[];                        // все выполненные задачи (с часами и без), по времени
  branches: string[];
};

const isDone = (t: Task) => t.status === 'completed' && !!t.completed_at && !t.deleted_at && !t.is_template;
const byTime = (a: { at: number; taskId?: string }, b: { at: number; taskId?: string }) =>
  a.at - b.at || String(a.taskId).localeCompare(String(b.taskId));

/** Навык задачи: свой или навык проекта по умолчанию. */
export function effectiveSkillId(t: Task, projects: Map<string, Project>): string | null {
  if (t.skill_id) return t.skill_id;
  const p = t.project_id ? projects.get(t.project_id) : undefined;
  return p?.default_skill_id ?? null;
}

export function branchList(skills: Skill[]): string[] {
  const alive = skills.filter((s) => !s.deleted_at).sort((a, b) => a.sort_order - b.sort_order);
  const seen = new Set<string>(alive.map((s) => s.branch));
  const out = BRANCH_ORDER.filter((b) => seen.has(b));
  for (const s of alive) if (!out.includes(s.branch)) out.push(s.branch);
  return out;
}

function prepare(data: GrowthData): Ctx {
  const skills = new Map(data.skills.filter((s) => !s.deleted_at).map((s) => [s.id, s]));
  const projects = new Map(data.projects.filter((p) => !p.deleted_at).map((p) => [p.id, p]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const done = data.tasks.filter(isDone)
    .map((t) => ({ t, at: Date.parse(t.completed_at!), taskId: t.id }))
    .sort(byTime).map((x) => x.t);
  const credits: Credit[] = [];
  for (const t of done) {
    const sid = effectiveSkillId(t, projects);
    const s = sid ? skills.get(sid) : undefined;
    if (!s || !t.estimate_min || t.estimate_min <= 0) continue;
    const at = Date.parse(t.completed_at!);
    credits.push({ taskId: t.id, skillId: s.id, branch: s.branch, projectId: t.project_id, minutes: t.estimate_min, at, day: dayOf(at) });
  }
  return { data, skills, projects, tasks, credits, done, branches: branchList(data.skills) };
}

type Totals = { skill: Map<string, number>; branch: Map<string, number>; total: number };

function totals(credits: Iterable<Credit>, keep: (c: Credit) => boolean = () => true): Totals {
  const t: Totals = { skill: new Map(), branch: new Map(), total: 0 };
  for (const c of credits) {
    if (!keep(c)) continue;
    t.skill.set(c.skillId, (t.skill.get(c.skillId) ?? 0) + c.minutes);
    t.branch.set(c.branch, (t.branch.get(c.branch) ?? 0) + c.minutes);
    t.total += c.minutes;
  }
  return t;
}

const lvl = (kind: LevelKind, m: number | undefined) => levelInfo(kind, m ?? 0).level;

/** Часы навыков, веток и общие (мин). */
export function hoursSnapshot(data: GrowthData) {
  const t = totals(prepare(data).credits);
  return { skill: t.skill, branch: t.branch, total: t.total };
}

// ───────────── «Персонаж»: уровни, «+0:45», аура, дни без роста ─────────────

export type SkillStat = {
  id: string; branch: string; hidden: boolean;
  minutes: number; info: LevelInfo;
  /** Часы, выполненные сегодня. */
  todayMin: number;
  /** Уровень вырос сегодня — аура до конца дня. */
  aura: boolean;
  /** Дней с последней выполненной задачи; null — задач ещё не было. */
  idleDays: number | null;
  /** 0 часов — «не открыт» / «новый». */
  opened: boolean;
  /** Активные квесты, где у навыка есть часы. */
  questIds: string[];
};
export type BranchStat = { key: string; minutes: number; info: LevelInfo; todayMin: number; aura: boolean };
export type CharacterStats = {
  skills: SkillStat[]; branches: BranchStat[];
  total: { minutes: number; info: LevelInfo; todayMin: number; aura: boolean };
};

export function characterStats(data: GrowthData, today: string): CharacterStats {
  const ctx = prepare(data);
  const now = totals(ctx.credits);
  const before = totals(ctx.credits, (c) => c.day < today);
  const todayT = totals(ctx.credits, (c) => c.day === today);
  const lastDay = new Map<string, string>();
  for (const c of ctx.credits) lastDay.set(c.skillId, c.day);
  const activeQuests = new Set([...ctx.projects.values()].filter((p) => p.is_quest && p.status === 'open').map((p) => p.id));
  const questsOf = new Map<string, Set<string>>();
  for (const c of ctx.credits) {
    if (!c.projectId || !activeQuests.has(c.projectId)) continue;
    if (!questsOf.has(c.skillId)) questsOf.set(c.skillId, new Set());
    questsOf.get(c.skillId)!.add(c.projectId);
  }
  const skills = [...ctx.skills.values()].sort((a, b) => a.sort_order - b.sort_order).map((s): SkillStat => {
    const m = now.skill.get(s.id) ?? 0;
    const ld = lastDay.get(s.id);
    return {
      id: s.id, branch: s.branch, hidden: !s.active,
      minutes: m, info: levelInfo('skill', m), todayMin: todayT.skill.get(s.id) ?? 0,
      aura: lvl('skill', m) > lvl('skill', before.skill.get(s.id)),
      idleDays: ld ? daysBetween(ld, today) : null,
      opened: m > 0, questIds: [...(questsOf.get(s.id) ?? [])],
    };
  });
  const branches = ctx.branches.map((key): BranchStat => {
    const m = now.branch.get(key) ?? 0;
    return { key, minutes: m, info: levelInfo('branch', m), todayMin: todayT.branch.get(key) ?? 0,
      aura: lvl('branch', m) > lvl('branch', before.branch.get(key)) };
  });
  return {
    skills, branches,
    total: { minutes: now.total, info: levelInfo('total', now.total), todayMin: todayT.total,
      aura: lvl('total', now.total) > lvl('total', before.total) },
  };
}

/**
 * Точка-бейдж: вырос ли уровень навыка, ветки или общий от задач, выполненных после последнего открытия «Персонажа».
 * Тихие пересчёты (правка оценки старой задачи, перенос навыка) двигают и «до», и «после» — точку не зажигают.
 * Раздел ещё ни разу не открывали (seenAt = null) — точки нет.
 */
export function badgeOn(data: GrowthData, seenAt: string | null): boolean {
  if (!seenAt) return false;
  const ctx = prepare(data);
  const seen = Date.parse(seenAt);
  const now = totals(ctx.credits);
  const then = totals(ctx.credits, (c) => c.at <= seen);
  if (lvl('total', now.total) > lvl('total', then.total)) return true;
  for (const [k, m] of now.branch) if (lvl('branch', m) > lvl('branch', then.branch.get(k))) return true;
  for (const [k, m] of now.skill) if (lvl('skill', m) > lvl('skill', then.skill.get(k))) return true;
  return false;
}

// ───────────── Отметка задачи — моменты роста ─────────────

export type LevelStep = { from: number; to: number };
export type TaskMoment =
  /** Нет навыка или оценки — плашки роста нет (обычная плашка отмены). */
  | { kind: 'none' }
  | {
    kind: 'hours' | 'level' | 'total';
    skillId: string; branch: string; minutes: number;
    skill: LevelStep; branchLevel: LevelStep; total: LevelStep;
    /** Для kind = 'total': номер закрывшейся главы (последней, если одна задача взяла сразу несколько уровней). */
    closedChapter?: number;
  };

/**
 * Что показать при отметке задачи (taskId уже выполнена в data): уровни «до» (без этой задачи) и «после».
 * Для «Отменить» / снятия отметки — те же числа: откат на skill.from, тихо.
 */
export function taskMoment(data: GrowthData, taskId: string): TaskMoment {
  const ctx = prepare(data);
  const c = ctx.credits.find((x) => x.taskId === taskId);
  if (!c) return { kind: 'none' };
  const after = totals(ctx.credits);
  const s = after.skill.get(c.skillId) ?? 0, b = after.branch.get(c.branch) ?? 0;
  const skill = { from: lvl('skill', s - c.minutes), to: lvl('skill', s) };
  const branchLevel = { from: lvl('branch', b - c.minutes), to: lvl('branch', b) };
  const total = { from: lvl('total', after.total - c.minutes), to: lvl('total', after.total) };
  const base = { skillId: c.skillId, branch: c.branch, minutes: c.minutes, skill, branchLevel, total };
  if (total.to > total.from) return { kind: 'total', ...base, closedChapter: total.to - 1 };
  if (skill.to > skill.from || branchLevel.to > branchLevel.from) return { kind: 'level', ...base };
  return { kind: 'hours', ...base };
}

// ───────────── Главы ─────────────

export type ChapterBounds = {
  /** Глава N — от получения общего уровня N до получения N + 1. */
  n: number;
  start: number; end: number | null;
  startDay: string;
  /** Последний день главы для подписи «12–25 нояб.»: день перед получением следующего уровня (у текущей — сегодня). */
  lastDay: string;
  /** Календарных дней (у текущей — «идёт N дней», считая сегодня). */
  days: number;
  closed: boolean;
};

function bounds(ctx: Ctx, today: string): ChapterBounds[] {
  if (!ctx.credits.length) return [];
  const reached: number[] = [];
  reached[1] = ctx.credits[0].at;
  let total = 0, level = 1;
  for (const c of ctx.credits) {
    total += c.minutes;
    while (minutesForLevel('total', level + 1) <= total) reached[++level] = c.at;
  }
  const out: ChapterBounds[] = [];
  for (let n = 1; n <= level; n++) {
    const start = reached[n], end = n < level ? reached[n + 1] : null;
    const startDay = dayOf(start);
    if (end === null) {
      out.push({ n, start, end, startDay, lastDay: today, days: daysBetween(startDay, today) + 1, closed: false });
    } else {
      const nextDay = dayOf(end);
      out.push({ n, start, end, startDay, lastDay: maxDay(startDay, addDays(nextDay, -1)),
        days: Math.max(1, daysBetween(startDay, nextDay)), closed: true });
    }
  }
  return out;
}

export function chapterBounds(data: GrowthData, today: string) { return bounds(prepare(data), today); }

/** Момент времени внутри главы: задача, давшая уровень N + 1, — последняя задача главы N. */
const inChapter = (b: ChapterBounds, at: number) => (b.n === 1 ? at >= b.start : at > b.start) && (b.end === null || at <= b.end);
const upTo = (b: ChapterBounds, at: number) => b.end === null || at <= b.end;
const beforeChapter = (b: ChapterBounds, at: number) => (b.n === 1 ? at < b.start : at <= b.start);

export type IdleMark = { kind: 'none' } | { kind: 'days'; days: number } | { kind: 'whole'; secondInRow: boolean };
export type ChapterSkillRow = {
  id: string; branch: string; star: boolean; shade: boolean;
  /** 0 часов на конец главы — «не открыт». */
  locked: boolean;
  from: number; to: number; minutes: number; progress: number; toNext: number; idle: IdleMark;
};
export type ChapterProjectRow = {
  id: string; quest: boolean; minutes: number; totalMin: number; estimate: number | null;
  /** Перебор оценки (мин), если есть. */
  over: number | null; done: boolean;
  /** Завершён — дней от первой задачи до завершения; в работе — «идёт N дней» на конец главы. */
  days: number | null;
};
export type ChapterHabitRow = { templateId: string; title: string; due: number; done: number };
export type ChapterMoment =
  | { kind: 'record'; day: string; minutes: number }
  | { kind: 'newSkill'; skillId: string; day: string }
  | { kind: 'quest'; projectId: string; day: string }
  | { kind: 'overtake'; skillId: string; overId: string; minutes: number; overMinutes: number };

export type ChapterStats = { days: number; minutes: number; avgPerDay: number; tasksDone: number };
export type ChapterSummary = {
  bounds: ChapterBounds;
  /** Уровень N → N + 1. */
  from: number; to: number;
  stats: ChapterStats;
  /** Прошлая глава для сравнения; у первой — null. */
  prev: ChapterStats | null;
  skills: ChapterSkillRow[];
  branches: { key: string; minutes: number; share: number; from: number; to: number }[];
  quests: { rows: ChapterProjectRow[]; done: number; inWork: number };
  projects: { rows: ChapterProjectRow[]; done: number; inWork: number };
  habits: ChapterHabitRow[];
  moments: ChapterMoment[];
};

function stats(ctx: Ctx, b: ChapterBounds): ChapterStats {
  const minutes = ctx.credits.filter((c) => inChapter(b, c.at)).reduce((s, c) => s + c.minutes, 0);
  const tasksDone = ctx.done.filter((t) => inChapter(b, Date.parse(t.completed_at!))).length;
  return { days: b.days, minutes, avgPerDay: minutes / b.days, tasksDone };
}

export function chapterSummary(data: GrowthData, n: number, today: string): ChapterSummary | null {
  const ctx = prepare(data);
  const all = bounds(ctx, today);
  const b = all[n - 1];
  if (!b) return null;
  const prevB = all[n - 2] ?? null;
  const st = stats(ctx, b);

  const startT = totals(ctx.credits, (c) => beforeChapter(b, c.at));
  const endT = totals(ctx.credits, (c) => upTo(b, c.at));
  const chT = totals(ctx.credits, (c) => inChapter(b, c.at));
  const prevT = prevB ? totals(ctx.credits, (c) => inChapter(prevB, c.at)) : null;
  const lastDayOf = new Map<string, string>();
  for (const c of ctx.credits) if (upTo(b, c.at)) lastDayOf.set(c.skillId, c.day);

  // В. Навыки
  const maxCh = Math.max(0, ...chT.skill.values());
  const skills = [...ctx.skills.values()]
    .filter((s) => s.active || (chT.skill.get(s.id) ?? 0) > 0)
    .map((s): ChapterSkillRow & { order: number } => {
      const m = chT.skill.get(s.id) ?? 0, endM = endT.skill.get(s.id) ?? 0;
      const info = levelInfo('skill', endM);
      let idle: IdleMark = { kind: 'none' };
      if (m === 0) idle = { kind: 'whole', secondInRow: !!prevT && (prevT.skill.get(s.id) ?? 0) === 0 };
      else {
        const d = daysBetween(lastDayOf.get(s.id)!, b.lastDay);
        if (d > 0) idle = { kind: 'days', days: d };
      }
      return {
        id: s.id, branch: s.branch, order: s.sort_order,
        star: maxCh > 0 && m === maxCh, shade: m < 0.05 * st.minutes, locked: endM === 0,
        from: lvl('skill', startT.skill.get(s.id)), to: info.level, minutes: m,
        progress: info.progress, toNext: info.toNext, idle,
      };
    })
    .sort((x, y) => Number(x.locked) - Number(y.locked) || y.minutes - x.minutes || x.order - y.order)
    .map(({ order: _o, ...row }) => row);

  // Г. Ветки
  const branches = ctx.branches.map((key) => {
    const m = chT.branch.get(key) ?? 0;
    return { key, minutes: m, share: st.minutes ? m / st.minutes : 0,
      from: lvl('branch', startT.branch.get(key)), to: lvl('branch', endT.branch.get(key)) };
  });

  // Ж. Квесты и проекты
  const endAt = b.end ?? Infinity;
  const touched = new Set<string>();
  for (const t of ctx.done) if (t.project_id && ctx.projects.has(t.project_id) && inChapter(b, Date.parse(t.completed_at!))) touched.add(t.project_id);
  const rows: ChapterProjectRow[] = [...touched].map((pid) => {
    const p = ctx.projects.get(pid)!;
    let minutes = 0, totalMin = 0, first: string | null = null;
    for (const t of ctx.done) {
      if (t.project_id !== pid) continue;
      const at = Date.parse(t.completed_at!);
      if (at > endAt) continue;
      first ??= dayOf(at);
      const est = t.estimate_min ?? 0;
      totalMin += est;
      if (inChapter(b, at)) minutes += est;
    }
    const done = p.status === 'completed' && !!p.completed_at && Date.parse(p.completed_at) <= endAt;
    const estimate = p.is_quest ? p.quest_estimate_min : null;
    const until = done ? dayOf(p.completed_at!) : (b.end === null ? today : dayOf(b.end));
    return {
      id: pid, quest: p.is_quest, minutes, totalMin, estimate,
      over: estimate !== null && totalMin > estimate ? totalMin - estimate : null, done,
      days: first ? Math.max(1, daysBetween(first, until) + 1) : null,
    };
  }).sort((x, y) => y.minutes - x.minutes);
  const group = (quest: boolean) => {
    const r = rows.filter((x) => x.quest === quest);
    return { rows: r, done: r.filter((x) => x.done).length, inWork: r.filter((x) => !x.done).length };
  };

  // З. Привычки: «положено» — все копии привычки с днём внутри главы, включая удалённые;
  // «выполнено» — только выполненные в день своей копии (по Москве). Перенесённая или удалённая копия — пропуск.
  const habitMap = new Map<string, ChapterHabitRow>();
  for (const t of ctx.data.tasks) {
    if (!t.is_habit || t.is_template || !t.repeat_template_id || !t.repeat_date) continue;
    if (t.repeat_date < b.startDay || t.repeat_date > b.lastDay) continue;
    const id = t.repeat_template_id;
    const h = habitMap.get(id) ?? { templateId: id, title: ctx.tasks.get(id)?.title ?? t.title, due: 0, done: 0 };
    h.due++;
    if (!t.deleted_at && t.status === 'completed' && t.completed_at && dayOf(t.completed_at) === t.repeat_date) h.done++;
    habitMap.set(id, h);
  }
  const habits = [...habitMap.values()].sort((x, y) => y.due - x.due || x.title.localeCompare(y.title));

  return {
    bounds: b, from: n, to: n + 1, stats: st, prev: prevB ? stats(ctx, prevB) : null,
    skills, branches, quests: group(true), projects: group(false), habits,
    moments: moments(ctx, b, startT),
  };
}

// К. Моменты главы — что нашлось, не больше четырёх.
function moments(ctx: Ctx, b: ChapterBounds, startT: Totals): ChapterMoment[] {
  const out: ChapterMoment[] = [];

  // Рекордный день: максимум часов за день на конец главы, если этот день внутри главы (при равенстве рекорд — первый).
  // Дни делятся между главами по подписи дат: день получения уровня — первый день следующей главы.
  const perDay = new Map<string, number>();
  for (const c of ctx.credits) if (c.day <= b.lastDay) perDay.set(c.day, (perDay.get(c.day) ?? 0) + c.minutes);
  let best: [string, number] | null = null;
  for (const [day, m] of [...perDay].sort((x, y) => (x[0] < y[0] ? -1 : 1))) if (!best || m > best[1]) best = [day, m];
  if (best && best[0] >= b.startDay && best[0] <= b.lastDay) out.push({ kind: 'record', day: best[0], minutes: best[1] });

  // Первый уровень нового навыка: навык впервые получил уровень 2 внутри главы.
  const run = new Map<string, number>();
  for (const c of ctx.credits) {
    const was = run.get(c.skillId) ?? 0, now = was + c.minutes;
    run.set(c.skillId, now);
    if (inChapter(b, c.at) && was < minutesForLevel('skill', 2) && now >= minutesForLevel('skill', 2)) {
      out.push({ kind: 'newSkill', skillId: c.skillId, day: c.day });
    }
  }

  // Первый квест, завершённый в этой главе.
  const quest = [...ctx.projects.values()]
    .filter((p) => p.is_quest && p.status === 'completed' && p.completed_at && inChapter(b, Date.parse(p.completed_at)))
    .sort((x, y) => Date.parse(x.completed_at!) - Date.parse(y.completed_at!))[0];
  if (quest) out.push({ kind: 'quest', projectId: quest.id, day: dayOf(quest.completed_at!) });

  // Обгон: навык A был позади B (у B были часы) и к концу главы обошёл его. Самый заметный — обогнан самый «большой» B.
  const endT = totals(ctx.credits, (c) => upTo(b, c.at));
  let pass: Extract<ChapterMoment, { kind: 'overtake' }> | null = null;
  for (const a of ctx.skills.keys()) for (const o of ctx.skills.keys()) {
    if (a === o) continue;
    const a0 = startT.skill.get(a) ?? 0, o0 = startT.skill.get(o) ?? 0;
    const a1 = endT.skill.get(a) ?? 0, o1 = endT.skill.get(o) ?? 0;
    if (o0 > 0 && a0 < o0 && a1 > o1 && (!pass || o1 > pass.overMinutes || (o1 === pass.overMinutes && a1 > pass.minutes))) {
      pass = { kind: 'overtake', skillId: a, overId: o, minutes: a1, overMinutes: o1 };
    }
  }
  if (pass) out.push(pass);

  return out.slice(0, 4);
}

// ───────────── Архив «Главы» ─────────────

export type ChapterArchive = {
  current: { n: number; startDay: string; days: number; toNext: number; progress: number } | null;
  /** Прошлые главы, свежие сверху. */
  past: {
    n: number; startDay: string; lastDay: string; days: number; avgPerDay: number; first: boolean;
    stars: string[]; branches: { key: string; share: number }[];
  }[];
};

export function chapterArchive(data: GrowthData, today: string): ChapterArchive {
  const ctx = prepare(data);
  const all = bounds(ctx, today);
  const cur = all.find((b) => !b.closed);
  const total = levelInfo('total', totals(ctx.credits).total);
  const past = all.filter((b) => b.closed).reverse().map((b) => {
    const st = stats(ctx, b);
    const ch = totals(ctx.credits, (c) => inChapter(b, c.at));
    const max = Math.max(0, ...ch.skill.values());
    const stars = [...ctx.skills.values()].sort((x, y) => x.sort_order - y.sort_order)
      .filter((s) => max > 0 && ch.skill.get(s.id) === max).map((s) => s.id);
    return {
      n: b.n, startDay: b.startDay, lastDay: b.lastDay, days: b.days, avgPerDay: st.avgPerDay, first: b.n === 1, stars,
      branches: ctx.branches.map((key) => ({ key, share: st.minutes ? (ch.branch.get(key) ?? 0) / st.minutes : 0 })),
    };
  });
  return {
    current: cur ? { n: cur.n, startDay: cur.startDay, days: cur.days, toNext: total.toNext, progress: total.progress } : null,
    past,
  };
}

// ───────────── Квесты на «Персонаже» ─────────────

export type QuestCard = {
  id: string;
  /** Часы выполненных задач проекта — любых навыков, без условия «есть навык». */
  minutes: number; estimate: number | null; over: number | null;
  /** Навыки чипами: часы задач квеста с навыком. */
  skills: { id: string; minutes: number }[];
  todayMin: number;
  /** «Идёт N дней» с первой выполненной задачи; null — задач ещё нет. */
  days: number | null;
};

export function questCards(data: GrowthData, today: string): { cards: QuestCard[]; tooMany: boolean } {
  const ctx = prepare(data);
  const quests = [...ctx.projects.values()].filter((p) => p.is_quest && p.status === 'open').sort((a, b) => a.sort_order - b.sort_order);
  const cards = quests.map((p): QuestCard => {
    let minutes = 0, todayMin = 0, first: string | null = null;
    for (const t of ctx.done) {
      if (t.project_id !== p.id) continue;
      const day = dayOf(t.completed_at!);
      first ??= day;
      minutes += t.estimate_min ?? 0;
      if (day === today) todayMin += t.estimate_min ?? 0;
    }
    const sk = new Map<string, number>();
    for (const c of ctx.credits) if (c.projectId === p.id) sk.set(c.skillId, (sk.get(c.skillId) ?? 0) + c.minutes);
    const estimate = p.quest_estimate_min;
    return {
      id: p.id, minutes, estimate, over: estimate !== null && minutes > estimate ? minutes - estimate : null,
      skills: [...sk].map(([id, m]) => ({ id, minutes: m })).sort((x, y) => y.minutes - x.minutes),
      todayMin, days: first ? daysBetween(first, today) + 1 : null,
    };
  });
  return { cards, tooMany: cards.length > 3 };
}

// ───────────── Удаление навыка: куда уйдут часы ─────────────

export type SkillDeleteMode = { kind: 'transfer'; to: string } | { kind: 'keep' };

/** Что меняется в базе при удалении навыка (12_ТЗ, 6.2): у задач и проектов навык переносится или снимается. */
export function skillDeletionPatch(data: GrowthData, skillId: string, mode: SkillDeleteMode) {
  const value = mode.kind === 'transfer' ? mode.to : null;
  return {
    tasks: data.tasks.filter((t) => !t.deleted_at && t.skill_id === skillId).map((t) => t.id),
    projects: data.projects.filter((p) => !p.deleted_at && p.default_skill_id === skillId).map((p) => p.id),
    value,
  };
}

export function applySkillDeletion(data: GrowthData, skillId: string, mode: SkillDeleteMode): GrowthData {
  const patch = skillDeletionPatch(data, skillId, mode);
  const tasks = new Set(patch.tasks), projects = new Set(patch.projects);
  const stamp = new Date(0).toISOString();
  return {
    tasks: data.tasks.map((t) => (tasks.has(t.id) ? { ...t, skill_id: patch.value } : t)),
    projects: data.projects.map((p) => (projects.has(p.id) ? { ...p, default_skill_id: patch.value } : p)),
    skills: data.skills.map((s) => (s.id === skillId ? { ...s, deleted_at: s.deleted_at ?? stamp } : s)),
  };
}

export type SkillDeletionPreview = {
  /** Сколько часов уходит из навыка. */
  minutes: number;
  /** Навыки, которые получат часы (строки с 0:00 не попадают). */
  moved: { skillId: string; minutes: number }[];
  /** «Больше не будут считаться». */
  lost: number;
  total: LevelStep;
  /** Ветки, у которых меняется уровень (в любую сторону). */
  branches: ({ key: string } & LevelStep)[];
};

export function skillDeletionPreview(data: GrowthData, skillId: string, mode: SkillDeleteMode): SkillDeletionPreview {
  const before = totals(prepare(data).credits);
  const after = totals(prepare(applySkillDeletion(data, skillId, mode)).credits);
  const minutes = before.skill.get(skillId) ?? 0;
  const moved = [...after.skill]
    .map(([id, m]) => ({ skillId: id, minutes: m - (before.skill.get(id) ?? 0) }))
    .filter((x) => x.skillId !== skillId && x.minutes > 0)
    .sort((x, y) => y.minutes - x.minutes);
  const branches = branchList(data.skills)
    .map((key) => ({ key, from: lvl('branch', before.branch.get(key)), to: lvl('branch', after.branch.get(key)) }))
    .filter((x) => x.from !== x.to);
  return {
    minutes, moved, lost: minutes - moved.reduce((s, x) => s + x.minutes, 0),
    total: { from: lvl('total', before.total), to: lvl('total', after.total) }, branches,
  };
}
