import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySkillDeletion, badgeOn, chapterArchive, chapterBounds, chapterSummary, characterStats,
  hoursSnapshot, questCards, skillDeletionPatch, skillDeletionPreview, taskMoment, type GrowthData,
} from '../growth.ts';
import { at, done, project, skill, task } from './fixtures.ts';

// Навыки: s1 Сценарий, s2 Монтаж, s5 Съёмка — Креатор; s3 Продукт, s4 Финансы (скрыт) — Профессия; sx — удалён.
const SKILLS = [
  skill('s1', 'creator', 1), skill('s2', 'creator', 2), skill('s3', 'profession', 3),
  skill('s4', 'profession', 4, { active: false }), skill('s5', 'creator', 5),
  skill('sx', 'profession', 6, { deleted_at: '2026-11-01T00:00:00Z' }),
];
const g = (tasks: GrowthData['tasks'], projects: GrowthData['projects'] = [], skills = SKILLS): GrowthData => ({ tasks, projects, skills });

// ───────────── Часы ─────────────

test('Часы · считаются только выполненные задачи с оценкой и навыком (свой или проекта)', () => {
  const pP = project('pP', { default_skill_id: 's3' });
  const h = hoursSnapshot(g([
    done('a', '2026-11-10', 60, 's1'),                       // +1:00 Сценарий
    done('b', '2026-11-10', null, 's1'),                     // нет оценки — 0
    done('c', '2026-11-10', 30, null),                       // нет навыка — 0
    done('d', '2026-11-10', 30, null, 'pP'),                 // навык проекта → Продукт
    task('e', { estimate_min: 100, skill_id: 's1' }),        // не выполнена — 0
    done('f', '2026-11-10', 30, 's1', null, '10:00', { deleted_at: '2026-11-11T00:00:00Z' }), // удалена — 0
    done('g', '2026-11-10', 40, 's4'),                       // скрытый навык — считается
    done('h', '2026-11-10', 50, 'sx'),                       // удалённый навык — 0
    task('i', { status: 'canceled', completed_at: at('2026-11-10'), estimate_min: 20, skill_id: 's1' }), // отменена — 0
  ], [pP]));
  assert.equal(h.skill.get('s1'), 60);
  assert.equal(h.skill.get('s3'), 30);
  assert.equal(h.skill.get('s4'), 40);
  assert.equal(h.skill.has('sx'), false);
  assert.equal(h.branch.get('creator'), 60);
  assert.equal(h.branch.get('profession'), 70);
  assert.equal(h.total, 130);
});

test('Часы · ветки не зашиты: третья ветка считается так же', () => {
  const h = hoursSnapshot(g([done('a', '2026-11-10', 90, 'z1')], [], [...SKILLS, skill('z1', 'health', 7)]));
  assert.equal(h.branch.get('health'), 90);
  assert.equal(h.total, 90);
});

// ───────────── «Персонаж»: сегодня, аура, дни без роста ─────────────

const TODAY = '2026-11-13';
const pQ = project('pQ', { is_quest: true, default_skill_id: 's2', quest_estimate_min: 120 });
const DAY_TASKS = [
  done('t1', '2026-11-12', 60, 's1'),
  done('t2', '2026-11-13', 150, 's1', null, '09:00'),  // Сценарий 1:00 → 3:30 — уровень 2 сегодня
  done('t3', '2026-11-13', 45, null, 'pQ', '11:00'),    // навык квеста → Монтаж
  done('t4', '2026-11-03', 30, 's3'),
];

test('Персонаж · «+2:30 сегодня», уровень 2, аура (уровень вырос сегодня), до 3 — 3:45', () => {
  const s = characterStats(g(DAY_TASKS, [pQ]), TODAY);
  const s1 = s.skills.find((x) => x.id === 's1')!;
  assert.equal(s1.minutes, 210);
  assert.equal(s1.todayMin, 150);
  assert.equal(s1.info.level, 2);
  assert.equal(s1.info.toNext, 225);
  assert.equal(s1.aura, true);
  assert.equal(s1.idleDays, 0);
});

test('Персонаж · без нового уровня ауры нет; навык квеста получает часы и ссылку на квест', () => {
  const s = characterStats(g(DAY_TASKS, [pQ]), TODAY);
  const s2 = s.skills.find((x) => x.id === 's2')!;
  assert.equal(s2.minutes, 45);
  assert.equal(s2.aura, false);
  assert.deepEqual(s2.questIds, ['pQ']);
});

test('Персонаж · дни без роста = дней с последней задачи навыка; не открытый навык — 0 ч, «новый»', () => {
  const s = characterStats(g(DAY_TASKS, [pQ]), TODAY);
  assert.equal(s.skills.find((x) => x.id === 's3')!.idleDays, 10);
  const s5 = s.skills.find((x) => x.id === 's5')!;
  assert.equal(s5.opened, false);
  assert.equal(s5.idleDays, null);
});

test('Персонаж · скрытый навык помечен hidden, удалённого в списке нет; ветки и общий с «сегодня»', () => {
  const s = characterStats(g(DAY_TASKS, [pQ]), TODAY);
  assert.equal(s.skills.find((x) => x.id === 's4')!.hidden, true);
  assert.equal(s.skills.some((x) => x.id === 'sx'), false);
  const cr = s.branches.find((b) => b.key === 'creator')!;
  assert.equal(cr.minutes, 255);
  assert.equal(cr.todayMin, 195);
  assert.equal(s.total.minutes, 285);
  assert.deepEqual(s.branches.map((b) => b.key), ['creator', 'profession']);
});

test('Персонаж · аура ветки: Креатор перешёл 7:00 сегодня', () => {
  const s = characterStats(g([done('a', '2026-11-12', 400, 's2'), done('b', '2026-11-13', 30, 's1')]), TODAY);
  const cr = s.branches.find((b) => b.key === 'creator')!;
  assert.equal(cr.info.level, 2);
  assert.equal(cr.aura, true);
});

test('Сегодня · локальная дата Москвы: 22:30 UTC 12 нояб. = 01:30 13 нояб. — это «сегодня»', () => {
  const t = done('n', '2026-11-12', 30, 's1');
  t.completed_at = '2026-11-12T22:30:00Z';
  const s = characterStats(g([t]), TODAY);
  assert.equal(s.skills.find((x) => x.id === 's1')!.todayMin, 30);
});

// ───────────── Точка-бейдж ─────────────

test('Точка · уровень вырос после последнего открытия «Персонажа» — горит', () => {
  assert.equal(badgeOn(g(DAY_TASKS, [pQ]), at(TODAY, '08:00')), true);
});

test('Точка · после открытия задачи были, но уровень не вырос — не горит', () => {
  assert.equal(badgeOn(g(DAY_TASKS, [pQ]), at(TODAY, '10:00')), false);
});

test('Точка · тихий пересчёт (правка оценки старой задачи до 6:40) — не горит; раздел не открывали — не горит', () => {
  const edited = DAY_TASKS.map((t) => (t.id === 't1' ? { ...t, estimate_min: 400 } : t));
  assert.equal(badgeOn(g(edited, [pQ]), at(TODAY, '10:00')), false);
  assert.equal(badgeOn(g(DAY_TASKS, [pQ]), null), false);
});

// ───────────── Отметка задачи ─────────────

test('Отметка · без навыка или оценки — плашки роста нет', () => {
  assert.deepEqual(taskMoment(g([done('a', TODAY, 30, null)]), 'a'), { kind: 'none' });
  assert.deepEqual(taskMoment(g([done('a', TODAY, null, 's1')]), 'a'), { kind: 'none' });
});

test('Отметка · только часы — «Сделано · +0:45 Монтаж»', () => {
  const m = taskMoment(g([done('a', TODAY, 45, 's2')]), 'a');
  assert.equal(m.kind, 'hours');
  if (m.kind === 'none') return;
  assert.equal(m.skillId, 's2');
  assert.equal(m.minutes, 45);
});

test('Отметка · вырос навык — плашка уровня «Сценарий → уровень 2»', () => {
  const m = taskMoment(g([done('a', '2026-11-12', 150, 's1'), done('b', TODAY, 45, 's1')]), 'b');
  assert.equal(m.kind, 'level');
  if (m.kind === 'none') return;
  assert.deepEqual(m.skill, { from: 1, to: 2 });
  assert.deepEqual(m.branchLevel, { from: 1, to: 1 });
});

test('Отметка · навык и ветка одной задачей — одна плашка, обе строки', () => {
  const m = taskMoment(g([done('a', '2026-11-12', 230, 's1'), done('b', '2026-11-12', 170, 's2'), done('c', TODAY, 30, 's2')]), 'c');
  assert.equal(m.kind, 'level');
  if (m.kind === 'none') return;
  assert.deepEqual(m.skill, { from: 1, to: 2 });
  assert.deepEqual(m.branchLevel, { from: 1, to: 2 });
});

test('Отметка · новый общий уровень — экран поздравления, закрылась глава 1', () => {
  const m = taskMoment(g([done('a', '2026-11-12', 800, 's3'), done('b', TODAY, 20, 's3')]), 'b');
  assert.equal(m.kind, 'total');
  if (m.kind === 'none') return;
  assert.deepEqual(m.total, { from: 1, to: 2 });
  assert.equal(m.closedChapter, 1);
});

test('Отмена · задача снова открыта: уровень тихо откатился, ауры нет, плашки роста нет', () => {
  const tasks = [done('a', '2026-11-12', 150, 's1'), done('b', TODAY, 45, 's1')];
  const m = taskMoment(g(tasks), 'b');
  assert.equal(m.kind !== 'none' && m.skill.from, 1);                      // «Сценарий −0:45, уровень 1»
  const reopened = tasks.map((t) => (t.id === 'b' ? { ...t, status: 'open' as const, completed_at: null } : t));
  assert.deepEqual(taskMoment(g(reopened), 'b'), { kind: 'none' });
  const s1 = characterStats(g(reopened), TODAY).skills.find((x) => x.id === 's1')!;
  assert.equal(s1.info.level, 1);
  assert.equal(s1.aura, false);
});

// ───────────── Главы ─────────────
// Общий уровень 2 — 13:30 (810 мин), 3 — 28:30 (1710 мин).
const pQb = project('pQb', { is_quest: true, quest_estimate_min: 300, status: 'completed', completed_at: at('2026-10-05', '12:00') });
const pQc = project('pQc', { is_quest: true, status: 'completed', completed_at: at('2026-10-06', '12:00') });
const pQa = project('pQa', { is_quest: true, quest_estimate_min: 1000 });
const pP = project('pP', { default_skill_id: 's3' });
const H = task('H', { title: 'Медитация', is_template: true, is_habit: true });
const habit = (day: string, status: 'open' | 'completed', extra = {}) => task('h' + day, {
  is_habit: true, repeat_template_id: 'H', repeat_date: day, status,
  completed_at: status === 'completed' ? at(day, '20:00') : null, ...extra,
});
const HISTORY = g([
  done('A', '2026-10-01', 300, 's1'),
  done('B', '2026-10-02', 300, null, 'pP'),
  done('C', '2026-10-03', 240, 's1'),              // 14:00 → общий уровень 2: глава 1 закрыта
  done('D', '2026-10-03', null, 's1', null, '15:00'),
  done('E', '2026-10-05', 400, 's3', 'pQb'),
  done('F', '2026-10-08', 500, 's2', 'pQa'),       // 29:00 → общий уровень 3: глава 2 закрыта
  done('G', '2026-10-10', 60, 's3'),
  H, habit('2026-10-03', 'completed'), habit('2026-10-04', 'open'), habit('2026-10-05', 'completed'),
  habit('2026-10-06', 'completed', { deleted_at: '2026-10-07T00:00:00Z' }), habit('2026-10-08', 'completed'),
  habit('2026-10-07', 'completed', { when_date: '2026-10-08', completed_at: at('2026-10-08', '20:00') }), // среда → перенесена на четверг
], [pQa, pQb, pQc, pP]);
const T2 = '2026-10-12';

test('Главы · границы: глава 1 — 1–2 окт., 2 дня; глава 2 — 3–7 окт., 5 дней; глава 3 идёт 5 дней', () => {
  const b = chapterBounds(HISTORY, T2);
  assert.deepEqual(b.map((x) => [x.n, x.startDay, x.lastDay, x.days, x.closed]), [
    [1, '2026-10-01', '2026-10-02', 2, true],
    [2, '2026-10-03', '2026-10-07', 5, true],
    [3, '2026-10-08', '2026-10-12', 5, false],
  ]);
});

test('Главы · одна задача взяла два уровня — пустая глава между ними (1 день), закрылась последняя', () => {
  const data = g([done('big', '2026-10-01', 2000, 's1')]);
  assert.equal(chapterBounds(data, T2).length, 3);
  assert.equal(chapterBounds(data, T2)[1].days, 1);
  const m = taskMoment(data, 'big');
  assert.equal(m.kind === 'total' && m.closedChapter, 2);
});

test('Сводка · итоги: за 5 дней, 3:00 в день, задач 5 (с привычками и без часов); прошлая — 2 дня, 7:00, 3', () => {
  const s = chapterSummary(HISTORY, 2, T2)!;
  assert.deepEqual([s.from, s.to], [2, 3]);
  assert.deepEqual(s.stats, { days: 5, minutes: 900, avgPerDay: 180, tasksDone: 5 });
  assert.deepEqual(s.prev, { days: 2, minutes: 840, avgPerDay: 420, tasksDone: 3 });
});

test('Сводка · первая глава — без сравнения', () => {
  assert.equal(chapterSummary(HISTORY, 1, T2)!.prev, null);
});

test('Сводка · навыки: сортировка по часам главы, ★ у максимума, «было → стало», «в тени», не открыт — внизу', () => {
  const s = chapterSummary(HISTORY, 2, T2)!;
  assert.deepEqual(s.skills.map((k) => k.id), ['s2', 's3', 's1', 's5']);   // скрытый s4 без часов в главе — не показан
  const [s2, s3, s1, s5] = s.skills;
  assert.deepEqual([s2.star, s2.from, s2.to, s2.minutes], [true, 1, 3, 500]);
  assert.deepEqual([s3.star, s3.from, s3.to, s3.minutes, s3.toNext], [false, 2, 3, 400, 46]);
  assert.deepEqual([s1.from, s1.to, s1.minutes, s1.shade], [3, 3, 0, true]);
  assert.equal(s5.locked, true);
});

test('Сводка · без роста: «2 дн.», «вся глава», «вся глава · 2-я подряд»', () => {
  const ch2 = chapterSummary(HISTORY, 2, T2)!;
  assert.deepEqual(ch2.skills.find((k) => k.id === 's3')!.idle, { kind: 'days', days: 2 });
  assert.deepEqual(ch2.skills.find((k) => k.id === 's1')!.idle, { kind: 'whole', secondInRow: false });
  assert.deepEqual(ch2.skills.find((k) => k.id === 's2')!.idle, { kind: 'none' });
  const ch3 = chapterSummary(HISTORY, 3, T2)!;
  assert.deepEqual(ch3.skills.find((k) => k.id === 's1')!.idle, { kind: 'whole', secondInRow: true });
});

test('Сводка · ★ при равенстве — у всех с максимумом', () => {
  const s = chapterSummary(g([done('a', '2026-10-01', 400, 's1'), done('b', '2026-10-02', 400, 's3')]), 1, T2)!;
  assert.deepEqual(s.skills.filter((k) => k.star).map((k) => k.id), ['s1', 's3']);
});

test('Сводка · ветки: доля и часы главы, уровень «было → стало»', () => {
  const s = chapterSummary(HISTORY, 2, T2)!;
  const cr = s.branches.find((b) => b.key === 'creator')!, pr = s.branches.find((b) => b.key === 'profession')!;
  assert.deepEqual([cr.minutes, Math.round(cr.share * 100), cr.from, cr.to], [500, 56, 2, 3]);
  assert.deepEqual([pr.minutes, Math.round(pr.share * 100), pr.from, pr.to], [400, 44, 1, 2]);
});

test('Сводка · квесты: часы главы, всего / оценка, перебор, завершён / в работе, срок', () => {
  const q = chapterSummary(HISTORY, 2, T2)!.quests;
  assert.deepEqual([q.done, q.inWork], [1, 1]);
  assert.deepEqual(q.rows.map((r) => [r.id, r.minutes, r.totalMin, r.estimate, r.over, r.done, r.days]), [
    ['pQa', 500, 500, 1000, null, false, 1],
    ['pQb', 400, 400, 300, 100, true, 1],
  ]);
  const p = chapterSummary(HISTORY, 1, T2)!.projects;
  assert.deepEqual(p.rows.map((r) => [r.id, r.minutes, r.done, r.days]), [['pP', 300, false, 2]]);
});

test('Сводка · привычки: положено — все копии с днём в главе (и удалённые), выполнено — только в свой день', () => {
  // 3 окт. ✓, 4 окт. не сделана, 5 окт. ✓, 6 окт. удалена — пропуск, ср 7 окт. перенесена и сделана в чт — пропуск
  assert.deepEqual(chapterSummary(HISTORY, 2, T2)!.habits, [{ templateId: 'H', title: 'Медитация', due: 5, done: 2 }]);
  assert.deepEqual(chapterSummary(g([done('a', '2026-10-01', 60, 's1')]), 1, T2)!.habits, []);
});

test('Сводка · привычки: удалённая копия — пропуск; перенос со среды на четверг и выполнение в четверг — пропуск', () => {
  const tpl = task('W', { title: 'Обзор', is_template: true, is_habit: true });
  const copy = (id: string, day: string, extra = {}) => task(id, { is_habit: true, repeat_template_id: 'W', repeat_date: day, ...extra });
  const data = g([
    done('a', '2026-10-05', 60, 's1'), tpl,
    copy('w1', '2026-10-05', { status: 'completed', completed_at: at('2026-10-05', '23:30') }),       // пн, сделана в свой день ✓
    copy('w2', '2026-10-06', { deleted_at: '2026-10-06T12:00:00Z' }),                                 // вт, удалена
    copy('w3', '2026-10-07', { when_date: '2026-10-08', status: 'completed', completed_at: at('2026-10-08', '09:00') }), // ср → чт
  ]);
  assert.deepEqual(chapterSummary(data, 1, T2)!.habits, [{ templateId: 'W', title: 'Обзор', due: 3, done: 1 }]);
});

test('Сводка · моменты главы 2: рекордный день, первый уровень нового навыка, первый квест главы, обгон', () => {
  assert.deepEqual(chapterSummary(HISTORY, 2, T2)!.moments, [
    { kind: 'record', day: '2026-10-05', minutes: 400 },
    { kind: 'newSkill', skillId: 's2', day: '2026-10-08' },
    { kind: 'quest', projectId: 'pQb', day: '2026-10-05' },
    { kind: 'overtake', skillId: 's3', overId: 's1', minutes: 700, overMinutes: 540 },
  ]);
});

test('Сводка · моменты главы 1: рекорд при равенстве — первый день; обгона «с нуля» нет', () => {
  assert.deepEqual(chapterSummary(HISTORY, 1, T2)!.moments, [
    { kind: 'record', day: '2026-10-01', minutes: 300 },
    { kind: 'newSkill', skillId: 's1', day: '2026-10-01' },
    { kind: 'newSkill', skillId: 's3', day: '2026-10-02' },
  ]);
});

test('Сводка · рекорд — на конец главы: поздний рекорд не забирает момент у старой главы', () => {
  const later = g([...HISTORY.tasks, done('Z', '2026-10-11', 900, 's5')], HISTORY.projects);
  assert.equal(chapterSummary(later, 2, T2)!.moments[0].kind, 'record');
});

test('Архив · текущая глава сверху (идёт 5 дней, до уровня 4 — 15:00), прошлые — свежие сверху', () => {
  const a = chapterArchive(HISTORY, T2);
  assert.deepEqual(a.current && [a.current.n, a.current.days, a.current.toNext], [3, 5, 900]);
  assert.deepEqual(a.past.map((c) => [c.n, c.days, c.avgPerDay, c.stars, c.first]), [
    [2, 5, 180, ['s2'], false],
    [1, 2, 420, ['s1'], true],
  ]);
  assert.deepEqual(a.past[0].branches.map((b) => [b.key, Math.round(b.share * 100)]), [['creator', 56], ['profession', 44]]);
});

test('Архив · после правки оценки главы пересчитываются сами', () => {
  const edited = g(HISTORY.tasks.map((t) => (t.id === 'C' ? { ...t, estimate_min: 100 } : t)), HISTORY.projects);
  assert.notDeepEqual(chapterBounds(edited, T2).map((b) => b.startDay), chapterBounds(HISTORY, T2).map((b) => b.startDay));
});

// ───────────── Квесты на «Персонаже» ─────────────

test('Квесты · часы любых навыков, перебор, навыки чипами, «+1:30 сегодня», «идёт 4 дня»', () => {
  const quest = project('q', { is_quest: true, default_skill_id: 's2', quest_estimate_min: 120 });
  const free = project('q2', { is_quest: true, sort_order: 1 });
  const { cards, tooMany } = questCards(g([
    done('q1', '2026-11-10', 60, 's1', 'q'),
    done('q2', TODAY, 90, null, 'q'),               // навык квеста → Монтаж
    task('q3', { project_id: 'q', estimate_min: 30 }),
    done('r1', TODAY, 45, null, 'q2'),              // без навыка — в часы квеста идёт
  ], [quest, free, project('closed', { is_quest: true, status: 'completed' }), project('plain')]), TODAY);
  assert.equal(tooMany, false);
  assert.deepEqual(cards.map((c) => c.id), ['q', 'q2']);
  const [c, c2] = cards;
  assert.deepEqual([c.minutes, c.estimate, c.over, c.todayMin, c.days], [150, 120, 30, 90, 4]);
  assert.deepEqual(c.skills, [{ id: 's2', minutes: 90 }, { id: 's1', minutes: 60 }]);
  assert.deepEqual([c2.minutes, c2.estimate, c2.over, c2.skills, c2.days], [45, null, null, [], 1]);
});

test('Квесты · больше трёх активных — «договорились о трёх»; квест без задач — без срока', () => {
  const qs = [1, 2, 3, 4].map((i) => project('q' + i, { is_quest: true }));
  const { cards, tooMany } = questCards(g([], qs), TODAY);
  assert.equal(tooMany, true);
  assert.equal(cards[0].days, null);
});

// ───────────── Удаление навыка ─────────────
// Сценарий (s1) — 13:30: 8:00 в проекте «Работа» (навык Продукт), 2:30 без проекта, 3:00 в проекте с навыком Сценарий.
const pWork = project('pA', { default_skill_id: 's3' });
const pOwn = project('pB', { default_skill_id: 's1' });
const DEL = g([
  done('d1', '2026-11-10', 480, 's1', 'pA'),
  done('d2', '2026-11-10', 150, 's1'),
  done('d3', '2026-11-10', 120, null, 'pB'),
  done('d4', '2026-11-10', 60, 's1', 'pB'),
  done('d5', '2026-11-10', 100, 's2'),
], [pWork, pOwn]);

test('Удаление · «Оставить без навыка»: Продукт получит 8:00, 5:30 больше не будут считаться, уровни: общий 2 → 1, Креатор 3 → 1, Профессия 1 → 2', () => {
  const p = skillDeletionPreview(DEL, 's1', { kind: 'keep' });
  assert.equal(p.minutes, 810);
  assert.deepEqual(p.moved, [{ skillId: 's3', minutes: 480 }]);
  assert.equal(p.lost, 330);
  assert.deepEqual(p.total, { from: 2, to: 1 });
  assert.deepEqual(p.branches, [{ key: 'creator', from: 3, to: 1 }, { key: 'profession', from: 1, to: 2 }]);
});

test('Удаление · «Перенести» в навык той же ветки: 13:30 перейдут, уровни не меняются', () => {
  const p = skillDeletionPreview(DEL, 's1', { kind: 'transfer', to: 's5' });
  assert.deepEqual(p.moved, [{ skillId: 's5', minutes: 810 }]);
  assert.equal(p.lost, 0);
  assert.deepEqual(p.total, { from: 2, to: 2 });
  assert.deepEqual(p.branches, []);
});

test('Удаление · «Перенести» в другую ветку: часы уходят и в её ветку', () => {
  const p = skillDeletionPreview(DEL, 's1', { kind: 'transfer', to: 's3' });
  assert.deepEqual(p.moved, [{ skillId: 's3', minutes: 810 }]);
  assert.deepEqual(p.branches, [{ key: 'creator', from: 3, to: 1 }, { key: 'profession', from: 1, to: 2 }]);
});

test('Удаление · что меняется в базе и цифры после удаления совпали с окном; без удаления — всё как было', () => {
  assert.deepEqual(skillDeletionPatch(DEL, 's1', { kind: 'keep' }), { tasks: ['d1', 'd2', 'd4'], projects: ['pB'], value: null });
  const after = hoursSnapshot(applySkillDeletion(DEL, 's1', { kind: 'keep' }));
  assert.equal(after.skill.get('s3'), 480);
  assert.equal(after.skill.has('s1'), false);
  assert.equal(after.total, 580);
  assert.equal(hoursSnapshot(DEL).total, 910);            // «Отменить» = исходные данные
});
