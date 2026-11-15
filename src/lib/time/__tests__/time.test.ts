// Учёт времени: расчёты на выдуманных данных (21_ТЗ, раздел 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SlotValue, TimeCategory, TimeDirection, TimeSlot, TimeStage, TimeWeekSchedule } from '../types.ts';
import { dayAfterTick, mskNow, slotOfMin, weekStartOf, weekdayMon0 } from '../clock.ts';
import { fmtHM, fmtSigned } from '../format.ts';
import {
  accountedMin, blockLabel, dayBlocks, dayGrid, dragRange, lastStageOf, planSet, recentValues, untilEnd, type Catalog,
} from '../day.ts';
import { toggleDay, weekMask } from '../schedule.ts';
import { monthLine, monthNorm, weekSummary } from '../summary.ts';
import { compareRows, directionProjects, pickColumns, togglePick } from '../projects.ts';
import { deleteMode, slotsToMove } from '../catalog.ts';

// ── Выдуманный справочник ──
const cat = (id: string, extra: Partial<TimeCategory> = {}): TimeCategory =>
  ({ id, name: id, color: 'blue', status: 'active', sort_order: 0, deleted_at: null, ...extra });
const dir = (id: string, category_id: string, extra: Partial<TimeDirection> = {}): TimeDirection =>
  ({ id, category_id, name: id, status: 'active', norm_type: 'none', norm_min: 0, area_id: null, sort_order: 0, deleted_at: null, ...extra });
const stage = (id: string, direction_id: string, sort_order: number, extra: Partial<TimeStage> = {}): TimeStage =>
  ({ id, direction_id, name: id, status: 'active', sort_order, deleted_at: null, ...extra });
const proj = (id: string, created_at: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, status: 'open', deleted_at: null as string | null, created_at, ...extra });

const V = (category_id: string, direction_id: string | null = null, project_id: string | null = null, stage_id: string | null = null): SlotValue =>
  ({ category_id, direction_id, project_id, stage_id });
let tick = 0;
const S = (date: string, slot: number, v: SlotValue, updated_at?: string): TimeSlot =>
  ({ ...v, date, slot, updated_at: updated_at ?? `2026-11-01T00:00:${String(tick++ % 60).padStart(2, '0')}Z` });
/** Слоты с from до to (слоты, не включая to). */
const fill = (date: string, from: number, to: number, v: SlotValue, at?: string) =>
  Array.from({ length: to - from }, (_, i) => S(date, from + i, v, at));

const catalog: Catalog = {
  categories: [cat('Сон'), cat('Работа'), cat('Блог'), cat('Личное'), cat('Старое', { status: 'archived' })],
  directions: [dir('Основной', 'Работа', { norm_type: 'daily', norm_min: 360 }), dir('Видеоблог', 'Блог'), dir('Консалтинг', 'Работа', { norm_type: 'monthly', norm_min: 6000 })],
  stages: [stage('Идея', 'Видеоблог', 1), stage('Сценарий', 'Видеоблог', 2), stage('Монтаж', 'Видеоблог', 3)],
  projects: [proj('Видео 1', '2026-10-01T10:00:00Z'), proj('Видео 2', '2026-11-01T10:00:00Z')],
};

// ── 4.1. Слоты и день ──

test('Время · «Сейчас» и день — по Москве (UTC+3), граница в 00:00 МСК', () => {
  assert.deepEqual(mskNow(new Date('2026-11-16T20:59:00Z')), { date: '2026-11-16', min: 23 * 60 + 59 });
  assert.deepEqual(mskNow(new Date('2026-11-16T21:00:00Z')), { date: '2026-11-17', min: 0 });
  assert.equal(slotOfMin(13 * 60 + 40), 27); // 13:30–14:00
});

test('Время · смена дня: открыт сегодняшний — переходит на новый; открыт вчерашний — остаётся', () => {
  assert.equal(dayAfterTick('2026-11-16', '2026-11-16', '2026-11-17'), '2026-11-17');
  assert.equal(dayAfterTick('2026-11-15', '2026-11-16', '2026-11-17'), '2026-11-15');
  assert.equal(dayAfterTick('2026-11-16', '2026-11-16', '2026-11-16'), '2026-11-16');
});

test('Время · блоки: одинаковые соседи — один блок, как бы ни отметили; разные — отдельно', () => {
  const d = '2026-11-16';
  const slots = [
    ...fill(d, 2, 16, V('Сон')),                       // 1:00–8:00
    S(d, 22, V('Работа', 'Основной')), S(d, 23, V('Работа', 'Основной')), S(d, 24, V('Работа', 'Основной')), // по одному
    S(d, 25, V('Работа')),                              // другое значение (без направления)
    S(d, 30, V('Личное')),
  ];
  const blocks = dayBlocks(dayGrid(slots, d));
  assert.deepEqual(blocks.map((b) => [b.start, b.end]), [[2, 16], [22, 25], [25, 26], [30, 31]]);
  assert.equal(blockLabel(blocks[0], catalog), 'Сон · 1:00–8:00 · 7:00');
  assert.equal(blockLabel(blocks[1], catalog), 'Работа · Основной · 11:00–12:30 · 1:30');
  assert.equal(blockLabel(blocks[3], catalog), 'Личное · 15:00–15:30 · 0:30');
});

test('Время · «Разбить на слоты»: внутри разбитого диапазона — по слоту; вне — снова один блок', () => {
  const d = '2026-11-16';
  const grid = dayGrid(fill(d, 22, 28, V('Работа')), d);
  assert.equal(dayBlocks(grid, { start: 22, end: 28 }).length, 6);
  // Поменяли 12:00 на «Личное» и собрали: Работа / Личное / Работа (критерий 4)
  const { changes } = planSet(grid, [24], V('Личное'));
  const next = [...grid] as (SlotValue | null)[];
  for (const c of changes) next[c.slot] = c.value;
  assert.deepEqual(dayBlocks(next).map((b) => [b.start, b.end, b.value.category_id]), [[22, 24, 'Работа'], [24, 25, 'Личное'], [25, 28, 'Работа']]);
});

test('Время · «Учтено» считает и будущие слоты (сон наперёд)', () => {
  const d = '2026-11-16';
  const grid = dayGrid([...fill(d, 4, 16, V('Сон')), ...fill(d, 22, 28, V('Работа'))], d);
  assert.equal(fmtHM(accountedMin(grid)), '9:00');
});

test('Время · отметка диапазона: 11:00–14:00 одной категорией; повтор того же — без изменений; очистка', () => {
  const d = '2026-11-16';
  const grid = dayGrid([S(d, 26, V('Потери'))], d);
  const set = planSet(grid, [22, 23, 24, 25, 26, 27], V('Работа'));
  assert.equal(set.changes.length, 6);
  assert.deepEqual(set.prev.find((p) => p.slot === 26)?.value, V('Потери'));
  assert.equal(set.prev.filter((p) => p.value === null).length, 5);
  const g2 = [...grid] as (SlotValue | null)[];
  for (const c of set.changes) g2[c.slot] = c.value;
  assert.equal(planSet(g2, [22, 23], V('Работа')).changes.length, 0);
  assert.equal(planSet(g2, [22, 23, 40], null).changes.length, 2);
});

test('Время · протянуть за край: вниз до 15:00 через «Потери», вверх; не дальше дня', () => {
  const block = { start: 22, end: 26 }; // 11:00–13:00
  assert.deepEqual(dragRange(block, 'bottom', 29), [22, 23, 24, 25, 26, 27, 28, 29]); // до 15:00
  assert.deepEqual(dragRange(block, 'top', 20), [20, 21, 22, 23, 24, 25]);
  assert.equal(dragRange(block, 'bottom', 99).at(-1), 47);
  assert.equal(untilEnd(46, 240), 48); // «до 24:00»
});

// ── 4.2. «Последние» и этап ──

test('Время · «Последние»: различные значения по времени изменения, без архивных; архивная видна в слотах', () => {
  const d = '2026-11-16';
  const slots = [
    S(d, 1, V('Сон'), '2026-11-16T01:00:00Z'),
    S(d, 2, V('Сон'), '2026-11-16T01:00:01Z'),
    S(d, 20, V('Работа', 'Основной'), '2026-11-16T08:00:00Z'),
    S(d, 21, V('Старое'), '2026-11-16T09:00:00Z'),
    S(d, 22, V('Блог', 'Видеоблог', 'Видео 2', 'Монтаж'), '2026-11-16T10:00:00Z'),
    S(d, 23, V('Личное'), '2026-11-16T07:00:00Z'),
  ];
  const r = recentValues(slots, catalog, 4);
  assert.deepEqual(r.map((v) => v.category_id), ['Блог', 'Работа', 'Личное', 'Сон']);
  assert.equal(blockLabel(dayBlocks(dayGrid(slots, d)).find((b) => b.start === 21)!, catalog), 'Старое · 10:30–11:00 · 0:30');
});

test('Время · этап: выделен последний использованный в этом проекте (по времени слота)', () => {
  const st = ['Идея', 'Сценарий', 'Монтаж'];
  const slots = [
    S('2026-11-10', 20, V('Блог', 'Видеоблог', 'Видео 2', 'Идея')),
    S('2026-11-12', 20, V('Блог', 'Видеоблог', 'Видео 2', 'Сценарий')),
    S('2026-11-11', 30, V('Блог', 'Видеоблог', 'Видео 2', 'Монтаж'), '2026-11-15T00:00:00Z'), // поздно изменён, но раньше по времени
    S('2026-11-14', 20, V('Блог', 'Видеоблог', 'Видео 1', 'Монтаж')),
    S('2026-11-15', 20, V('Блог', 'Видеоблог', 'Видео 2')),
  ];
  assert.equal(lastStageOf(slots, 'Видео 2', st), 'Сценарий');
  assert.equal(lastStageOf(slots, 'Видео 1', st), 'Монтаж');
  assert.equal(lastStageOf(slots, 'Видео 9', st), null);
});

// ── 3.1. Автоперенос маски ──

test('Время · маска недели: своя строка; нет — последней более ранней; нет ни одной — все нерабочие', () => {
  const sch: TimeWeekSchedule[] = [
    { id: '1', direction_id: 'Основной', week_start: '2026-11-02', days: 0b0000111 },
    { id: '2', direction_id: 'Основной', week_start: '2026-11-09', days: 0b0011111 },
    { id: '3', direction_id: 'other', week_start: '2026-11-16', days: 0b1111111 },
  ];
  assert.deepEqual(weekMask(sch, 'Основной', '2026-11-09'), { mask: 0b0011111, source: 'own', from: '2026-11-09' });
  assert.deepEqual(weekMask(sch, 'Основной', '2026-11-30'), { mask: 0b0011111, source: 'inherited', from: '2026-11-09' });
  assert.deepEqual(weekMask(sch, 'Основной', '2026-10-26'), { mask: 0, source: 'none', from: null });
  // Клик по дате: копия унаследованной маски + переключение дня (чт)
  assert.equal(toggleDay(weekMask(sch, 'Основной', '2026-11-30').mask, 3), 0b0010111);
});

// ── 4.3. Сводка ──
// Неделя пн 16 – вс 22 нояб. 2026; «сейчас» — ср 18 нояб., 13:40.
const NOW = { date: '2026-11-18', min: 13 * 60 + 40 };
const WEEK = '2026-11-16';
const IT = V('Работа', 'Основной');
const workSch: TimeWeekSchedule[] = [{ id: 'w', direction_id: 'Основной', week_start: '2026-11-09', days: 0b0000111 }]; // пн–ср

test('Время · Сводка, норма «в рабочий день» (Основной 6:00, пн–ср): план, отклонение, среднее, «К прошлой»', () => {
  const slots = [
    ...fill('2026-11-16', 20, 34, IT),  // пн 7:00
    ...fill('2026-11-17', 20, 30, IT),  // вт 5:00
    ...fill('2026-11-18', 20, 28, IT),  // ср 4:00 (10:00–14:00; слот 13:30 начат — входит в «К прошлой», 14:00 ещё нет... здесь его нет)
    ...fill('2026-11-18', 28, 30, IT),  // ср 14:00–15:00 — после текущего момента (отметка наперёд)
    ...fill('2026-11-21', 20, 22, IT),  // сб 1:00 — нерабочий день с фактом
    // прошлая неделя
    ...fill('2026-11-09', 20, 32, IT),  // пн 6:00
    ...fill('2026-11-10', 20, 32, IT),  // вт 6:00
    ...fill('2026-11-11', 20, 26, IT),  // ср 3:00 — до 13:00
    ...fill('2026-11-11', 26, 30, IT),  // ср 13:00–15:00: 13:00 и 13:30 — до момента, 14:00 и 14:30 — после
  ];
  const s = weekSummary({ slots, table: { kind: 'direction', id: 'Основной' }, weekStart: WEEK, now: NOW, direction: catalog.directions[0], schedules: workSch });
  assert.equal(s.mode, 'daily');
  assert.equal(s.mask?.source, 'inherited');
  assert.deepEqual(s.fact.map(fmtHM), ['7:00', '5:00', '5:00', '0:00', '0:00', '1:00', '0:00']);
  assert.deepEqual(s.plan.map(fmtHM), ['6:00', '6:00', '6:00', '—', '—', '—', '—']);
  assert.deepEqual(s.dev.map(fmtSigned), ['+1:00', '−1:00', '−1:00', '—', '—', '+1:00', '—']);
  assert.equal(fmtSigned(s.devTotal), '0:00');
  assert.equal(fmtHM(s.planTotal), '18:00');
  assert.equal(fmtHM(s.factTotal), '18:00');
  // Среднее: факт в прошедшие рабочие дни (пн–ср, включая сегодня) ÷ 3 = 17:00 / 3
  assert.equal(Math.round(s.avg!), 340);
  // «К прошлой»: эта неделя до ср 13:40 = 7 + 5 + 4 = 16:00; прошлая до ср 13:40 = 6 + 6 + 4 = 16:00
  assert.equal(fmtSigned(s.toPrev), '0:00');
});

test('Время · Сводка, «К прошлой» не берёт слоты после текущего момента; прошлая неделя — целиком', () => {
  const slots = [
    ...fill('2026-11-16', 20, 24, IT),   // пн 2:00
    ...fill('2026-11-18', 30, 40, IT),   // ср 15:00–20:00 — будущее
    ...fill('2026-11-11', 20, 22, IT),   // прошлая ср 1:00 до момента
  ];
  const s = weekSummary({ slots, table: { kind: 'direction', id: 'Основной' }, weekStart: WEEK, now: NOW, direction: catalog.directions[0], schedules: workSch });
  assert.equal(fmtSigned(s.toPrev), '+1:00');
  const past = weekSummary({ slots, table: { kind: 'direction', id: 'Основной' }, weekStart: '2026-11-09', now: NOW, direction: catalog.directions[0], schedules: workSch });
  assert.equal(past.weekState, 'past');
  assert.equal(fmtSigned(past.toPrev), '+1:00'); // 1:00 против пустой недели 2–8 нояб.
  const future = weekSummary({ slots, table: { kind: 'direction', id: 'Основной' }, weekStart: '2026-11-23', now: NOW, direction: catalog.directions[0], schedules: workSch });
  assert.equal(future.toPrev, null);
  assert.equal(future.avg, null);
});

test('Время · Сводка категории «Блог»: Факт / Прошлая неделя / Разница; среднее за прошедшие дни', () => {
  const slots = [
    ...fill('2026-11-16', 36, 40, V('Блог', 'Видеоблог')),  // пн 2:00
    ...fill('2026-11-17', 36, 38, V('Блог')),             // вт 1:00 — без направления, тоже в категории
    ...fill('2026-11-10', 36, 42, V('Блог', 'Видеоблог')),  // прошлый вт 3:00
  ];
  const s = weekSummary({ slots, table: { kind: 'category', id: 'Блог' }, weekStart: WEEK, now: NOW, schedules: [] });
  assert.equal(s.mode, 'plain');
  assert.deepEqual(s.fact.slice(0, 3).map(fmtHM), ['2:00', '1:00', '0:00']);
  assert.deepEqual(s.prev.slice(0, 3).map(fmtHM), ['0:00', '3:00', '0:00']);
  assert.deepEqual(s.diff.map(fmtSigned), ['+2:00', '−2:00', '0:00', '—', '—', '—', '—']);
  assert.equal(fmtSigned(s.diffTotal), '0:00');
  assert.equal(s.avg, 60); // 3:00 ÷ 3 дня
  assert.equal(s.month, null);
});

test('Время · месячная норма (Консалтинг, 100:00): факт за месяц, «осталось», дни включая сегодня', () => {
  const ac = V('Работа', 'Консалтинг');
  const slots = [...fill('2026-11-02', 0, 48, ac), ...fill('2026-11-03', 0, 37, ac), ...fill('2026-10-30', 10, 20, ac)];
  const s = weekSummary({ slots, table: { kind: 'direction', id: 'Консалтинг' }, weekStart: WEEK, now: NOW, direction: catalog.directions[2], schedules: [] });
  assert.equal(monthLine(s.month!), 'Ноябрь: 42:30 из 100:00 · осталось 57:30 · дней в месяце осталось 13');
});

test('Время · месячная норма на стыке месяцев: текущая неделя — месяц сегодняшнего дня, иначе — месяц понедельника', () => {
  const ac = catalog.directions[2];
  const slots = [...fill('2026-11-30', 20, 22, V('Работа', 'Консалтинг')), ...fill('2026-12-02', 20, 24, V('Работа', 'Консалтинг'))];
  // Неделя пн 30 нояб. – вс 6 дек.; сегодня 2 дек. → декабрь
  const cur = monthNorm(slots, ac, '2026-11-30', '2026-12-02');
  assert.equal(cur.month, '2026-12');
  assert.equal(cur.fact, 120);
  assert.equal(cur.daysLeft, 30);
  // Та же неделя смотрится 10 дек. (прошлая) → месяц понедельника (ноябрь), дней осталось 0
  const past = monthNorm(slots, ac, '2026-11-30', '2026-12-10');
  assert.equal(past.month, '2026-11');
  assert.equal(past.fact, 60);
  assert.equal(past.daysLeft, 0);
  // Норма перевыполнена — «осталось» не меньше 0
  assert.equal(monthNorm(fill('2026-11-02', 0, 48, V('Работа', 'Консалтинг')), { ...ac, norm_min: 600 }, WEEK, NOW.date).left, 0);
});

test('Время · формат: «+0:30», «−1:30», ноль «0:00», пусто «—»', () => {
  assert.equal(fmtSigned(30), '+0:30');
  assert.equal(fmtSigned(-90), '−1:30');
  assert.equal(fmtSigned(0), '0:00');
  assert.equal(fmtSigned(null), '—');
  assert.equal(fmtHM(2550), '42:30');
});

// ── 4.4. Проекты ──

test('Время · Проекты: от новых к старым, включая завершённые и удалённые; по умолчанию 4; выбор не больше 4', () => {
  const projects = [
    proj('A', '2026-07-01T00:00:00Z', { status: 'completed' }), proj('B', '2026-08-01T00:00:00Z'), proj('C', '2026-09-01T00:00:00Z', { deleted_at: '2026-11-01T00:00:00Z' }),
    proj('D', '2026-10-01T00:00:00Z'), proj('E', '2026-11-01T00:00:00Z'), proj('F', '2026-11-05T00:00:00Z'),
  ];
  const yt = (p: string, st: string | null = null) => V('Блог', 'Видеоблог', p, st);
  const slots = ['A', 'B', 'C', 'D', 'E'].map((p, i) => S('2026-11-10', i, yt(p)));
  slots.push(S('2026-11-10', 10, V('Работа', 'Основной', 'F')));
  const avail = directionProjects(slots, 'Видеоблог', projects);
  assert.deepEqual(avail.map((p) => p.id), ['E', 'D', 'C', 'B', 'A']);
  assert.deepEqual(pickColumns(avail, null).map((p) => p.id), ['E', 'D', 'C', 'B']);
  assert.deepEqual(pickColumns(avail, ['A', 'D']).map((p) => p.id), ['D', 'A']);
  assert.deepEqual(togglePick(['A', 'B', 'C', 'D'], 'E'), ['A', 'B', 'C', 'D']);
  assert.deepEqual(togglePick(['A', 'B', 'C', 'D'], 'B'), ['A', 'C', 'D']);
});

test('Время · Проекты: «Всего», этапы по порядку, архивный этап с часами, «Без этапа», максимум (все при равенстве)', () => {
  const stages = [...catalog.stages, stage('Обложка', 'Видеоблог', 4, { status: 'archived' }), stage('Старый', 'Видеоблог', 5, { deleted_at: 'x' })];
  const yt = (p: string, st: string | null) => V('Блог', 'Видеоблог', p, st);
  const slots = [
    ...fill('2026-11-01', 0, 4, yt('Видео 2', 'Сценарий')),   // 2:00
    ...fill('2026-11-02', 0, 4, yt('Видео 1', 'Сценарий')),   // 2:00 — равенство
    ...fill('2026-11-03', 0, 6, yt('Видео 1', 'Монтаж')),     // 3:00
    ...fill('2026-11-04', 0, 2, yt('Видео 2', 'Обложка')),    // архивный этап с часами
    ...fill('2026-11-05', 0, 1, yt('Видео 2', null)),         // без этапа
  ];
  const cols = pickColumns(directionProjects(slots, 'Видеоблог', catalog.projects), null);
  assert.deepEqual(cols.map((p) => p.id), ['Видео 2', 'Видео 1']);
  const rows = compareRows(slots, 'Видеоблог', cols, stages);
  assert.deepEqual(rows.map((r) => r.label), ['Всего', 'Идея', 'Сценарий', 'Монтаж', 'Обложка', 'Без этапа']);
  assert.deepEqual(rows[0].values.map(fmtHM), ['3:30', '5:00']);
  assert.deepEqual(rows.find((r) => r.label === 'Сценарий')!.max, [0, 1]);
  assert.deepEqual(rows.find((r) => r.label === 'Монтаж')!.max, [1]);
  assert.deepEqual(rows.find((r) => r.label === 'Идея')!.max, []);
  assert.equal(rows.find((r) => r.label === 'Обложка')!.archived, true);
  // Один проект — один столбец, без подсветки
  const one = compareRows(slots, 'Видеоблог', cols.slice(0, 1), stages);
  assert.ok(one.every((r) => r.max.length === 0));
});

// ── 4.5. Удаление и перенос ──

test('Время · «Удалить» с часами — в архив, без часов — удаление; перенос направления берёт его слоты', () => {
  const slots = [S('2026-11-16', 1, V('Работа', 'Основной')), S('2026-11-16', 2, V('Работа'))];
  assert.equal(deleteMode(slots, 'direction', 'Основной'), 'archive');
  assert.equal(deleteMode(slots, 'direction', 'Видеоблог'), 'delete');
  assert.equal(deleteMode(slots, 'category', 'Работа'), 'archive');
  assert.deepEqual(slotsToMove(slots, 'Основной', 'Блог').map((s) => s.slot), [1]);
});

test('Время · неделя: понедельник и день недели без зависимости от пояса', () => {
  assert.equal(weekStartOf('2026-11-22'), '2026-11-16');
  assert.equal(weekStartOf('2026-11-16'), '2026-11-16');
  assert.equal(weekdayMon0('2026-11-22'), 6);
});

test('Время · запись: этап только вместе с проектом и направлением (правило приложения)', async () => {
  const { isWritableValue } = await import('../day.ts');
  assert.equal(isWritableValue(V('Блог', 'Видеоблог', 'Видео 2', 'Монтаж')), true);
  assert.equal(isWritableValue(V('Блог', 'Видеоблог', null, 'Монтаж')), false);
  assert.equal(isWritableValue(V('Блог', 'Видеоблог')), true);
  assert.equal(isWritableValue(V('Блог')), true);
});

// ── 9. Протягивание в обе стороны (правка после прода) ──

test('Время · протянуть: нижнюю ручку вверх — блок укорачивается снизу, хвост пустой; отмена возвращает хвост', async () => {
  const { dragSpan, planResize } = await import('../day.ts');
  const d = '2026-11-16';
  const W = V('Работа', 'Основной');
  const grid = dayGrid(fill(d, 22, 28, W), d); // 11:00–14:00
  const block = { start: 22, end: 28 };
  const next = dragSpan(block, 'bottom', 23); // отпустили на 11:30 → 11:00–12:00
  assert.deepEqual(next, { start: 22, end: 24 });
  const plan = planResize(grid, block, next, W);
  assert.deepEqual(plan.changes.map((c) => [c.slot, c.value]), [[24, null], [25, null], [26, null], [27, null]]);
  assert.equal(plan.cleared, 4);
  assert.equal(plan.filled, 0);
  assert.ok(plan.prev.every((p) => p.value && p.value.direction_id === 'Основной')); // ⌘Z вернёт очищенные
});

test('Время · протянуть: верхнюю ручку вниз — блок укорачивается сверху', async () => {
  const { dragSpan, resizePlan } = await import('../day.ts');
  const block = { start: 22, end: 28 };
  const next = dragSpan(block, 'top', 25); // начало — 12:30
  assert.deepEqual(next, { start: 25, end: 28 });
  assert.deepEqual(resizePlan(block, next), { fill: [25, 26, 27], clear: [22, 23, 24] });
});

test('Время · протянуть: минимум 1 слот — ручка не идёт дальше противоположного края', async () => {
  const { dragSpan } = await import('../day.ts');
  const block = { start: 22, end: 28 };
  assert.deepEqual(dragSpan(block, 'bottom', 22), { start: 22, end: 23 });
  assert.deepEqual(dragSpan(block, 'bottom', 5), { start: 22, end: 23 });
  assert.deepEqual(dragSpan(block, 'top', 27), { start: 27, end: 28 });
  assert.deepEqual(dragSpan(block, 'top', 40), { start: 27, end: 28 });
  assert.deepEqual(dragSpan(block, 'bottom', 99), { start: 22, end: 48 }); // и не дальше 24:00
});

test('Время · протянуть: смена направления в одном протягивании — применяется то, где отпустили', async () => {
  const { dragSpan, planResize } = await import('../day.ts');
  const d = '2026-11-16';
  const W = V('Работа');
  const grid = dayGrid([...fill(d, 22, 26, W), S(d, 27, V('Потери'))], d); // 11:00–13:00, «Потери» 13:30
  const block = { start: 22, end: 26 };
  // Повёл вниз до 15:00, потом вверх до 11:30 и отпустил: значение берётся только с последней точки.
  const path = [29, 30, 27, 24, 23];
  const last = dragSpan(block, 'bottom', path[path.length - 1]);
  const plan = planResize(grid, block, last, W);
  assert.deepEqual(last, { start: 22, end: 24 });
  assert.deepEqual(plan.changes.map((c) => c.slot), [24, 25]); // «Потери» в 13:30 не тронуты
  // Вниз и обратно вниз — удлинение перезаписывает пройденное, как раньше
  const down = planResize(grid, block, dragSpan(block, 'bottom', 28), W);
  assert.deepEqual(down.changes.map((c) => c.slot), [26, 27, 28]);
  assert.equal(down.cleared, 0);
});
