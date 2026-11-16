import { addDays, todayISO } from './dates';
import type { Data } from './store';
import type { Goal, GoalMeasurement, GoalStep, Task } from './types';
import type { SlotValue, TimeCategory, TimeDirection, TimeSlot, TimeStage } from './time/types';
import { dayAdd, mskNow, weekStartOf } from './time/clock';

// Выдуманные данные для локального просмотра (?preview). Реальных задач здесь быть не должно.
const t = todayISO();
let n = 0;
const task = (o: Partial<Task>): Task => ({
  id: `t${++n}`, project_id: null, area_id: null, title: '', notes: '', when_date: null, when_evening: false,
  someday: false, estimate_min: null, skill_id: null, deadline: null, status: 'open', completed_at: null,
  logged_at: null, sort_order: n, today_order: n, repeat_template_id: null, repeat_date: null, is_template: false, is_habit: false, no_skill: false, when_set_at: null, new_seen_at: null,
  created_at: '', deleted_at: null, ...o,
});

// История для «Персонажа»: выполненные задачи с оценками за последние 5 недель (выдуманные).
// Сегодняшние задачи — раньше текущего момента (иначе они «в будущем» относительно открытия раздела).
const at = (daysAgo: number, h = 11) => {
  if (daysAgo === 0) return new Date(Date.now() - (h - 8) * 7 * 60000).toISOString();
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString();
};
const HISTORY: [number, string, number, string | null][] = [
  // [дней назад, навык, минуты, проект]
  [34, 's2', 90, 'p2'], [33, 's1', 60, null], [32, 's8', 120, 'p1'], [31, 's2', 45, 'p2'], [30, 's5', 60, 'p4'],
  [28, 's8', 150, 'p1'], [27, 's1', 90, null], [26, 's10', 120, 'p5'], [25, 's2', 60, 'p2'], [24, 's8', 90, 'p1'],
  [22, 's5', 90, 'p4'], [21, 's9', 60, null], [20, 's8', 180, 'p1'], [19, 's1', 45, null], [18, 's10', 90, 'p5'],
  [16, 's2', 60, 'p2'], [15, 's8', 120, 'p1'], [14, 's6', 30, null], [13, 's5', 45, 'p4'], [12, 's10', 60, 'p5'],
  [10, 's8', 150, 'p1'], [9, 's1', 60, null], [8, 's2', 45, 'p2'], [7, 's9', 90, null], [6, 's8', 120, 'p1'],
  [5, 's7', 60, null], [4, 's5', 60, 'p4'], [3, 's8', 90, 'p1'], [2, 's1', 30, null], [1, 's10', 45, 'p5'],
  [0, 's2', 45, 'p2'], [0, 's8', 180, 'p1'], [0, 's1', 120, null],
];
const historyTasks = HISTORY.map(([ago, skill, est, project], i) => task({
  title: `Сделанная задача ${i + 1}`, skill_id: project ? null : skill, project_id: project, estimate_min: est,
  status: 'completed', completed_at: at(ago, 9 + (i % 8)), logged_at: ago > 1 ? at(ago, 23) : null,
}));

// Для приёмки сводки главы (глава 3, 3–12 дней назад):
// привычка — три копии: выполнена в свой день, перенесена и выполнена позже, удалена → «1 из 3»;
// квест «Курс по монтажу» завершён внутри главы → момент «первый квест» и строка с ✓.
const habitTemplate = task({ id: 'h0', title: 'Утренняя зарядка', is_template: true, is_habit: true });
const habitCopy = (id: string, ago: number, o: Partial<Task> = {}) => task({
  id, title: 'Утренняя зарядка', is_habit: true, repeat_template_id: 'h0', repeat_date: addDays(t, -ago), when_date: addDays(t, -ago), ...o,
});
const habitCopies = [
  habitCopy('h1', 8, { status: 'completed', completed_at: at(8, 8), logged_at: at(8, 23) }),
  habitCopy('h2', 6, { when_date: addDays(t, -5), status: 'completed', completed_at: at(5, 9), logged_at: at(5, 23) }),
];
const habitDeleted = habitCopy('h3', 4, { deleted_at: at(4, 12) });
// Для проверки вёрстки «Привычек» в сводке главы: длинное название «1 из 3», «18 из 21» (86%) и «7 из 7» (100%).
// Глава 3 — 1–10 дней назад; глава 4 (идёт, её сводка — в окне поздравления с уровнем 5) — сегодня.
// Пропущенные копии — удалённые (для сводки это тот же пропуск), чтобы не висели в «Сегодня».
// Копий «18 из 21» — по 2–3 в день: в демо главы короче 21 дня.
const habitSet = (tpl: string, title: string, agos: number[], doneCount: number) => {
  const copies = agos.map((ago, i) => task({
    id: `${tpl}c${i}`, title, is_habit: true, repeat_template_id: tpl, repeat_date: addDays(t, -ago), when_date: addDays(t, -ago),
    ...(i < doneCount ? { status: 'completed' as const, completed_at: at(ago, 7 + (i % 3)), logged_at: at(ago, 23) } : { deleted_at: at(ago, 23) }),
  }));
  return { tasks: [task({ id: tpl, title, is_template: true, is_habit: true }), ...copies.filter((c) => !c.deleted_at)], ghosts: copies.filter((c) => c.deleted_at) };
};
const LONG_HABIT = 'Прочитать 30 страниц книги про сторителлинг и выписать три главные мысли в заметки';
const habitSets = [
  habitSet('hl', LONG_HABIT, [10, 7, 4], 1),
  habitSet('hw', 'Стакан воды', [10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1], 18),
  habitSet('hs', 'Растяжка', [10, 9, 8, 7, 6, 5, 4], 7),
  habitSet('hl4', LONG_HABIT, [0, 0, 0], 1),
  habitSet('hw4', 'Стакан воды', Array(21).fill(0), 18),
  habitSet('hs4', 'Растяжка', [0, 0], 2),
];
const habitsLayout = habitSets.flatMap((x) => x.tasks);
const habitsLayoutGhosts = habitSets.flatMap((x) => x.ghosts);
// Для приёмки (критерий 8, смешанный случай): у «Маркетинга» задача в проекте с другим навыком («Запуск лендинга» → Продукт)
// и задача без проекта (из истории). «Оставить без навыка»: Продукт получит 1:00, 0:30 больше не будут считаться.
const mixedTask = task({ project_id: 'p1', skill_id: 's6', title: 'Текст рассылки о запуске', estimate_min: 60, status: 'completed', completed_at: at(9, 15), logged_at: at(9, 23) });
const questTasks = [
  task({ project_id: 'p6', title: 'Посмотреть модуль про склейки', estimate_min: 30, status: 'completed', completed_at: at(7, 19), logged_at: at(7, 23) }),
  task({ project_id: 'p6', title: 'Смонтировать тренировочный ролик', estimate_min: 30, status: 'completed', completed_at: at(5, 17), logged_at: at(5, 23) }),
];

const goal = (o: Partial<Goal>): Goal => ({
  id: 'g', title: '', metric: '', start_value: 0, target_value: 0, criterion: '', calc: 'once', period_n: 3, period_unit: 'month',
  due_date: null, review_date: null, status: 'active', achieved_at: null, sort_order: 0, deleted_at: null, ...o,
});
const step = (goal_id: string, i: number, threshold: number, taken_at: string | null = null): GoalStep => ({
  id: `${goal_id}st${i}`, goal_id, title: '', threshold, calc: 'goal', taken_at, taken_manual: false, sort_order: i, deleted_at: null,
});
const meas = (goal_id: string, i: number, daysAgo: number, value: number): GoalMeasurement => ({
  id: `${goal_id}m${i}`, goal_id, date: addDays(t, -daysAgo), value, comment: '', deleted_at: null,
});

// ── Учёт времени: выдуманный справочник и две недели отметок ──
const tc = (id: string, name: string, color: string, sort: number, o: Partial<TimeCategory> = {}): TimeCategory =>
  ({ id, name, color, status: 'active', sort_order: sort, deleted_at: null, ...o });
const td = (id: string, category_id: string, name: string, sort: number, o: Partial<TimeDirection> = {}): TimeDirection =>
  ({ id, category_id, name, status: 'active', norm_type: 'none', norm_min: 0, area_id: null, sort_order: sort, deleted_at: null, ...o });
const ts = (id: string, direction_id: string, name: string, sort: number): TimeStage =>
  ({ id, direction_id, name, status: 'active', sort_order: sort, deleted_at: null });
const TIME_CATS = [
  tc('c1', 'Сон', 'violet', 1), tc('c2', 'Личное', 'sky', 2), tc('c3', 'Блог', 'apricot', 3), tc('c4', 'Дом', 'sage', 4),
  tc('c5', 'Обучение', 'ochre', 5), tc('c6', 'Спорт', 'terracotta', 6), tc('c7', 'Работа', 'blue', 7), tc('c8', 'Потери', 'rose', 8),
];
const TIME_DIRS = [
  td('d1', 'c7', 'Основной проект', 1, { norm_type: 'daily', norm_min: 360, area_id: 'a1' }),
  td('d2', 'c7', 'Консалтинг', 2, { norm_type: 'monthly', norm_min: 2400 }),
  td('d3', 'c3', 'Видео', 1, { area_id: 'a3' }),
  td('d4', 'c3', 'Заметки', 2),
  td('d5', 'c5', 'Английский', 1),
];
const TIME_STAGES = ['Идея', 'Сценарий', 'Съёмка', 'Монтаж', 'Обложка и описание'].map((n, i) => ts(`e${i + 1}`, 'd3', n, i + 1));
const msk = mskNow();
const mon = weekStartOf(msk.date);
const v = (category_id: string, direction_id: string | null = null, project_id: string | null = null, stage_id: string | null = null): SlotValue =>
  ({ category_id, direction_id, project_id, stage_id });
function timeSlots(): TimeSlot[] {
  const out: TimeSlot[] = [];
  const put = (date: string, from: number, to: number, val: SlotValue, h = 0) => {
    for (let i = from; i < to; i++) {
      // Время правки — время слота, но не позже «сейчас» (отметки наперёд сделаны раньше), иначе «Последние» в превью врут.
      const at = Math.min(Date.parse(`${date}T${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:0${h}+03:00`), Date.now() - 3_600_000 + i * 1000);
      out.push({ ...val, date, slot: i, updated_at: new Date(at).toISOString() });
    }
  };
  for (let k = 13; k >= 0; k--) {
    const d = dayAdd(msk.date, -k);
    const wd = k % 7;
    const isToday = k === 0;
    put(d, 2, 16, v('c1'));                                  // сон 1:00–8:00
    put(d, 16, 18, v('c2'));                                 // утро
    if (isToday) { put(d, 18, 20, v('c6')); put(d, 20, 26, v('c7', 'd1')); put(d, 26, 27, v('c8')); put(d, 27, 28, v('c7', 'd1')); break; }
    const work = (k % 7) !== 5 && (k % 7) !== 6;
    if (work) { put(d, 20, 22 + (k % 3) * 2, v('c7', 'd1')); put(d, 24 + (k % 3), 32, v('c7', 'd1')); }
    if (k % 2 === 0) put(d, 32, 36, v('c7', 'd2'));
    put(d, 36, 40 + (wd % 2) * 2, v('c3', 'd3', k > 6 ? 'p8' : 'p7', TIME_STAGES[k % 5].id));
    if (k % 3 === 0) put(d, 42, 44, v('c5', 'd5'));
    put(d, 44, 46, v('c8'));
  }
  // Сон наперёд сегодня с 23:00
  put(msk.date, 46, 48, v('c1'), 1);
  // Старые видео — для сравнения проектов
  put(dayAdd(mon, -21), 36, 46, v('c3', 'd3', 'p9', 'e2'));
  put(dayAdd(mon, -20), 30, 44, v('c3', 'd3', 'p9', 'e4'));
  put(dayAdd(mon, -19), 30, 34, v('c3', 'd3', 'p9'));
  // Ещё два старых ролика: завершённый и удалённый (его часы остаются в отчётах)
  put(dayAdd(mon, -35), 30, 40, v('c3', 'd3', 'p12', 'e2')); put(dayAdd(mon, -34), 30, 46, v('c3', 'd3', 'p12', 'e4'));
  put(dayAdd(mon, -28), 30, 38, v('c3', 'd3', 'p11', 'e1')); put(dayAdd(mon, -27), 30, 44, v('c3', 'd3', 'p11', 'e4'));
  return out;
}

export const PREVIEW_SEED: Partial<Data> = {
  time_categories: TIME_CATS, time_directions: TIME_DIRS, time_stages: TIME_STAGES, time_slots: timeSlots(),
  timeProjects: [{ id: 'p11', area_id: 'a3', name: 'Ролик про объективы', notes: '', default_skill_id: null, is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 11, deleted_at: '2026-11-01T10:00:00Z', created_at: '2026-09-15T10:00:00Z' }],
  time_week_schedules: [{ id: 'w1', direction_id: 'd1', week_start: dayAdd(mon, -7), days: 0b0011111 }],
  habitGhosts: [habitDeleted, ...habitsLayoutGhosts],
  goals: [
    goal({ id: 'g1', title: 'Канал — 10 000 подписчиков', metric: 'подписчики', start_value: 410, target_value: 10000, review_date: addDays(t, 108), sort_order: 1 }),
    goal({ id: 'g2', title: 'Доход с контента — 500 000 ₽/мес', metric: '₽ с контента/мес', calc: 'average', target_value: 500000, sort_order: 2 }),
    goal({ id: 'g3', title: 'Прочитать 24 книги', metric: 'книги', target_value: 24, status: 'paused', sort_order: 3 }),
    // Для приёмки: последняя ступень взята, статус «активна» → «Достигнута по правилу — отметить?».
    goal({ id: 'g4', title: '100 роликов на канале', metric: 'ролики', start_value: 62, target_value: 100, review_date: addDays(t, 20), sort_order: 4 }),
    // Для приёмки (критерий 12): «среднее за 3 мес» — последний замер 26 000 выше порога 25 000, среднее 17 750 ниже.
    goal({ id: 'g7', title: 'Доход с курса — 50 000 ₽/мес', metric: '₽/мес', calc: 'average', target_value: 50000, review_date: addDays(t, 60), sort_order: 3.5 }),
    goal({ id: 'g5', title: '50 выступлений', metric: 'выступления', target_value: 50, status: 'achieved', achieved_at: addDays(t, -40), sort_order: 5 }),
    goal({ id: 'g6', title: 'Курс по монтажу — 3 модуля', metric: 'модули', target_value: 3, status: 'canceled', sort_order: 6 }),
  ],
  goal_steps: [
    ...[500, 2000, 3000, 5000, 7500, 10000].map((v, i) => step('g1', i, v, i === 0 ? addDays(t, -24) : null)),
    ...[1000, 20000, 50000, 100000, 500000].map((v, i) => step('g2', i, v, i === 0 ? addDays(t, -12) : null)),
    ...[70, 80, 90, 100].map((v, i) => step('g4', i, v, addDays(t, -30 + i * 7))),
    ...[10, 25, 50].map((v, i) => step('g5', i, v, addDays(t, -120 + i * 40))),
    ...[5000, 25000, 50000].map((v, i) => step('g7', i, v, i === 0 ? addDays(t, -60) : null)),
    ...[1, 2, 3].map((v, i) => step('g6', i, v, i === 0 ? addDays(t, -60) : null)),
  ],
  goal_measurements: [meas('g1', 0, 43, 410), meas('g1', 1, 24, 520), meas('g1', 2, 12, 870), meas('g1', 3, 3, 955), meas('g2', 0, 12, 1000),
    meas('g4', 0, 30, 71), meas('g4', 1, 23, 84), meas('g4', 2, 16, 93), meas('g4', 3, 9, 100), meas('g5', 0, 40, 50), meas('g7', 0, 90, 10000), meas('g7', 1, 60, 15000), meas('g7', 2, 30, 20000), meas('g7', 3, 5, 26000), meas('g6', 0, 60, 1)],
  areas: [
    { id: 'a1', name: 'Работа', sort_order: 1, deleted_at: null },
    { id: 'a2', name: 'Учёба', sort_order: 2, deleted_at: null },
    { id: 'a3', name: 'Блог', sort_order: 3, deleted_at: null },
  ],
  projects: [
    { id: 'p1', area_id: 'a1', name: 'Запуск нового лендинга', notes: 'Черновик структуры готов.', default_skill_id: 's8', is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 1, deleted_at: null },
    { id: 'p2', area_id: 'a1', name: 'Квартальный отчёт для команды с очень длинным названием', notes: '', default_skill_id: 's2', is_quest: true, quest_estimate_min: 480, status: 'open', completed_at: null, logged_at: null, sort_order: 2, deleted_at: null },
    { id: 'p4', area_id: 'a2', name: 'Видеоурок про свет', notes: '', default_skill_id: 's4', is_quest: true, quest_estimate_min: 240, status: 'open', completed_at: null, logged_at: null, sort_order: 3, deleted_at: null },
    { id: 'p5', area_id: 'a1', name: 'Финмодель для партнёров', notes: '', default_skill_id: 's10', is_quest: true, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 4, deleted_at: null },
    { id: 'p6', area_id: 'a2', name: 'Курс по монтажу', notes: '', default_skill_id: 's5', is_quest: true, quest_estimate_min: 50, status: 'completed', completed_at: at(5, 18), logged_at: at(5, 23), sort_order: 5, deleted_at: null },
    { id: 'p7', area_id: 'a3', name: 'Ролик про звук на улице', notes: '', default_skill_id: 's5', is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 6, deleted_at: null, created_at: '2026-11-08T10:00:00Z' },
    { id: 'p8', area_id: 'a3', name: 'Ролик про свет', notes: '', default_skill_id: 's5', is_quest: false, quest_estimate_min: null, status: 'completed', completed_at: at(7, 18), logged_at: null, sort_order: 7, deleted_at: null, created_at: '2026-10-20T10:00:00Z' },
    { id: 'p9', area_id: 'a3', name: 'Разбор камер для начинающих — что купить на первый бюджет', notes: '', default_skill_id: 's5', is_quest: false, quest_estimate_min: null, status: 'completed', completed_at: at(18, 18), logged_at: at(17, 23), sort_order: 8, deleted_at: null, created_at: '2026-10-01T10:00:00Z' },
    { id: 'p12', area_id: 'a3', name: 'Ролик про штативы', notes: '', default_skill_id: 's5', is_quest: false, quest_estimate_min: null, status: 'completed', completed_at: at(30, 18), logged_at: at(29, 23), sort_order: 10, deleted_at: null, created_at: '2026-08-20T10:00:00Z' },
    { id: 'p10', area_id: 'a3', name: 'Идеи для роликов', notes: '', default_skill_id: null, is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 9, deleted_at: null, created_at: '2026-09-01T10:00:00Z' },
    { id: 'p3', area_id: 'a2', name: 'Курс по рисованию', notes: '', default_skill_id: null, is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 1, deleted_at: null },
  ],
  tasks: [
    task({ project_id: 'p1', title: 'Собрать тексты для первого экрана', when_date: t, estimate_min: 45, when_set_at: at(1) }),
    task({ project_id: 'p1', title: 'Согласовать цвета с дизайнером', when_date: t, estimate_min: 30, status: 'completed', completed_at: new Date().toISOString() }),
    task({ project_id: 'p1', title: 'Подготовить форму заявки', when_date: addDays(t, 2), estimate_min: 60, notes: 'Поля: имя, почта' }),
    task({ project_id: 'p1', title: 'Сделать короткую версию для соцсетей', someday: true, estimate_min: 60 }),
    task({ project_id: 'p1', title: 'Разобрать отзывы', when_date: addDays(t, 12) }),
    task({ project_id: 'p2', title: 'Выгрузить цифры за квартал', when_date: t, estimate_min: 90, when_set_at: at(2) }),
    task({ project_id: 'p3', title: 'Нарисовать три скетча', when_date: t, when_evening: true, estimate_min: 60 }),
    task({ title: 'Позвонить в сервис', when_date: t, estimate_min: 15 }),
    // Для приёмки: одна отметка поднимает и навык (Речь на камеру 1 → 2), и ветку (Креатор 3 → 4).
    task({ title: 'Записать дубли для ролика', when_date: t, estimate_min: 360, skill_id: 's3' }),
    // Для приёмки: одна отметка даёт новый общий уровень (4 → 5) — экран поздравления.
    task({ project_id: 'p1', title: 'Собрать стратегию запуска на квартал', when_date: t, estimate_min: 1000 }),
    task({ title: 'Идея: заметки голосом' }),
    ...historyTasks,
    habitTemplate, ...habitCopies, ...questTasks, mixedTask, ...habitsLayout,
    task({ title: 'Купить подарок к выходным', when_date: addDays(t, 1), estimate_min: 30 }),
    task({ project_id: 'p3', title: 'Купить скетчбук', when_date: addDays(t, 1), estimate_min: 15 }),
  ],
  skills: ([
    ['Упаковка', 'creator', 'frame'], ['Сценарий', 'creator', 'pencil'], ['Речь на камеру', 'creator', 'mic'],
    ['Съёмка', 'creator', 'video'], ['Монтаж', 'creator', 'scissors'], ['Маркетинг', 'creator', 'megaphone'],
    ['ИИ и агентные системы', 'creator', 'sparkles'], ['Продукт', 'profession', 'cube'],
    ['Внедрение ИИ', 'profession', 'gear'], ['Финансы', 'profession', 'chart'],
  ] as const).map(([name, branch, icon], i) => ({ id: `s${i + 1}`, name, branch, icon, active: true, sort_order: i + 1, deleted_at: null })),
};
