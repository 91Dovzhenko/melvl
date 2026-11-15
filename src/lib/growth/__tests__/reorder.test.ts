import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navDropChanges, placeAt, resolveSlot, todayDrop } from '../../reorder.ts';
import { orderProjectTasks, projectGroupMaps, projectGroupOf } from '../../views.ts';
import { task } from './fixtures.ts';

const O = (...xs: [string, number][]) => xs.map(([id, order]) => ({ id, order }));

test('Порядок · между соседями — меняется одна запись, значение посередине', () => {
  assert.deepEqual(placeAt(O(['a', 1], ['b', 2], ['c', 3]), 1, 'x', 10), [{ id: 'x', order: 1.5 }]);
  assert.deepEqual(placeAt(O(['a', 1], ['b', 2]), 0, 'x', 10), [{ id: 'x', order: 0 }]);   // в начало
  assert.deepEqual(placeAt(O(['a', 1], ['b', 2]), 2, 'x', 0), [{ id: 'x', order: 3 }]);    // в конец
  assert.deepEqual(placeAt([], 0, 'x', 7), [{ id: 'x', order: 7 }]);                        // один в списке — не меняется
});

test('Порядок · соседи с одинаковым значением (копия повтора и шаблон) — группа перенумеровывается', () => {
  const ch = placeAt(O(['a', 5], ['b', 5], ['c', 5]), 1, 'x', 9);
  const order = new Map(ch.map((c) => [c.id, c.order]));
  // Итог: a < x < b < c; a не меняется (уже 5).
  const val = (id: string) => order.get(id) ?? 5;
  assert.ok(val('a') < val('x') && val('x') < val('b') && val('b') < val('c'));
  assert.ok(!order.has('a'));
});

test('Порядок · многократные вставки в одно место не ломают порядок', () => {
  let list = O(['a', 1], ['b', 2]);
  for (let k = 0; k < 60; k++) {
    const id = 'n' + k;
    const ch = placeAt(list, 1, id, 0);
    const m = new Map(ch.map((c) => [c.id, c.order]));
    list = [...list.slice(0, 1), { id, order: m.get(id)! }, ...list.slice(1)].map((o) => ({ id: o.id, order: m.get(o.id) ?? o.order }));
    const vals = list.map((o) => o.order);
    assert.deepEqual([...vals].sort((x, y) => x - y), vals, `шаг ${k}`);
  }
});

test('Проект · плашка только внутри своей группы; над чужой датой — ближайшее место у своей', () => {
  // Остальные задачи: сегодня, сегодня, Пт, Пт, 24 нояб.; тянем задачу с «Пт» (взяли с позиции 3).
  const g = ['today', 'today', 'date:fri', 'date:fri', 'date:24'];
  assert.deepEqual(resolveSlot(g, 'date:fri', 3, 3), { index: 3, valid: true });
  assert.deepEqual(resolveSlot(g, 'date:fri', 5, 3), { index: 4, valid: false });  // к «24 нояб.» — нельзя, остаётся у «Пт»
  assert.deepEqual(resolveSlot(g, 'date:fri', 0, 3), { index: 2, valid: false });  // к «Сегодня» — нельзя
  // Задача одна в своей группе — плашка остаётся на исходном месте.
  assert.deepEqual(resolveSlot(['today', 'date:24'], 'none', 0, 1), { index: 1, valid: false });
  assert.deepEqual(resolveSlot(['today', 'date:24'], 'none', 1, 1), { index: 1, valid: true });
});

test('Проект · группы: сегодня / вечер / без даты / дата / ожидание / когда-нибудь; порядок внутри — ручной', () => {
  const T = '2026-11-15';
  const tpl = task('tpl', { project_id: 'p', is_template: true });
  const copy = task('copy', { project_id: 'p', repeat_template_id: 'tpl', when_date: T });
  const { next, openCopy } = projectGroupMaps([tpl, copy], [{ task_id: 'tpl', next_date: '2026-11-22' }]);
  const key = (t: ReturnType<typeof task>) => projectGroupOf(t, next, openCopy, T).key;
  assert.equal(key(task('a', { when_date: T })), 'today');
  assert.equal(key(task('a', { when_date: '2026-11-10' })), 'today');
  assert.equal(key(task('a', { when_date: T, when_evening: true })), 'evening');
  assert.equal(key(task('a')), 'none');
  assert.equal(key(task('a', { when_date: '2026-11-20' })), 'date:2026-11-20');
  assert.equal(key(tpl), 'wait');
  assert.equal(key(task('a', { someday: true })), 'someday');
  // Внутри одной группы — по sort_order, а не по созданию.
  const list = [
    task('old', { project_id: 'p', created_at: '2026-11-01T10:00:00Z', sort_order: 5 }),
    task('new', { project_id: 'p', created_at: '2026-11-10T10:00:00Z', sort_order: 2 }),
  ];
  assert.deepEqual(orderProjectTasks(list, list, [], T).map((t) => t.id), ['new', 'old']);
});

test('«Сегодня» · по проектам: своя группа — порядок; другая группа — перенос туда; «Вечером»; «Списком» — свободно (19_ТЗ, 6.2)', () => {
  assert.deepEqual(todayDrop('day', 'p1', 'p1'), { ok: true, evening: false, key: 'sort_order' });
  // В группу другого проекта (области, «без проекта») — задача переезжает туда.
  assert.deepEqual(todayDrop('day', 'p2', 'p1'), { ok: true, evening: false, key: 'sort_order', moveTo: 'p2' });
  assert.deepEqual(todayDrop('day', 'none', 'p1'), { ok: true, evening: false, key: 'sort_order', moveTo: 'none' });
  assert.deepEqual(todayDrop('day', 'evening', 'p1'), { ok: true, evening: true, key: 'today_order' });
  // Вечерняя: в группу своего проекта — дневная; в группу проекта X — дневная и переезжает в X.
  assert.deepEqual(todayDrop('evening', 'p1', 'p1'), { ok: true, evening: false, key: 'sort_order' });
  assert.deepEqual(todayDrop('evening', 'p2', 'p1'), { ok: true, evening: false, key: 'sort_order', moveTo: 'p2' });
  assert.deepEqual(todayDrop('day', 'flat', 'flat'), { ok: true, evening: false, key: 'today_order' });
  assert.deepEqual(todayDrop('evening', 'flat', 'flat'), { ok: true, evening: false, key: 'today_order' });
});

test('Меню · задача на «Входящие», «Сегодня», проект, область', () => {
  const T = '2026-11-15';
  const t = { project_id: 'p1', area_id: null, when_date: '2026-11-20', when_evening: false, someday: false };
  assert.deepEqual(navDropChanges(t, { kind: 'inbox' }, T), { project_id: null, area_id: null, when_date: null, when_evening: false, someday: false });
  assert.deepEqual(navDropChanges(t, { kind: 'today' }, T), { when_date: T, when_evening: false, someday: false });
  assert.deepEqual(navDropChanges({ ...t, when_date: T, when_evening: true }, { kind: 'today' }, T), { when_date: T, when_evening: false, someday: false });
  assert.deepEqual(navDropChanges(t, { kind: 'project', id: 'p2' }, T), { project_id: 'p2', area_id: null }); // дата сохраняется
  assert.deepEqual(navDropChanges(t, { kind: 'area', id: 'a1' }, T), { project_id: null, area_id: 'a1' });
  // Ничего не меняется — пункт не цель.
  assert.equal(navDropChanges(t, { kind: 'project', id: 'p1' }, T), null);
  assert.equal(navDropChanges({ ...t, when_date: T }, { kind: 'today' }, T), null);
  assert.equal(navDropChanges({ project_id: null, area_id: null, when_date: null, when_evening: false, someday: false }, { kind: 'inbox' }, T), null);
});
