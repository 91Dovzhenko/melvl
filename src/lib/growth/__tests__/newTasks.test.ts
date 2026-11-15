import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalOf, copiesCreatedSince, isNewTask } from '../../newTasks.ts';
import { task } from './fixtures.ts';

// Тесты идут с TZ=Europe/Moscow: «сегодня» — 14 нояб. по Москве.
const T = '2026-11-14';
const MIDNIGHT = Date.parse('2026-11-14T00:00:00+03:00');

test('Новые · дата поставлена заранее и наступила сегодня — новая, приход в начале дня', () => {
  const t = task('a', { when_date: T, when_set_at: '2026-11-10T12:00:00+03:00' });
  assert.equal(arrivalOf(t, T), MIDNIGHT);
  assert.equal(isNewTask(t, T, null), true);
});

test('Новые · дата поставлена руками сегодня (создал в «Сегодня», выбрал «Сегодня») — не новая', () => {
  assert.equal(isNewTask(task('b', { when_date: T, when_set_at: '2026-11-14T09:00:00+03:00' }), T, null), false);
});

test('Новые · граница по Москве: 00:30 МСК 14 нояб. (21:30 UTC 13-го) — уже сегодня, не новая; 23:30 МСК 13-го — новая', () => {
  assert.equal(isNewTask(task('c', { when_date: T, when_set_at: '2026-11-13T21:30:00Z' }), T, null), false);
  assert.equal(isNewTask(task('d', { when_date: T, when_set_at: '2026-11-13T20:30:00Z' }), T, null), true);
});

test('Новые · перешедшая со вчера (дата в прошлом), «Когда-нибудь», выполненная, шаблон — не новые', () => {
  const old = '2026-11-01T10:00:00+03:00';
  assert.equal(isNewTask(task('e', { when_date: '2026-11-13', when_set_at: old }), T, null), false);
  assert.equal(isNewTask(task('f', { when_date: T, when_set_at: old, someday: true }), T, null), false);
  assert.equal(isNewTask(task('g', { when_date: T, when_set_at: old, status: 'completed', completed_at: '2026-11-14T08:00:00+03:00' }), T, null), false);
  assert.equal(isNewTask(task('h', { when_date: T, when_set_at: old, is_template: true }), T, null), false);
});

test('Новые · копия повтора, созданная сегодня (расписание, открытие приложения) — новая; вчерашняя копия на сегодня — по дате', () => {
  const copy = task('k', { when_date: T, repeat_template_id: 'tpl', repeat_date: T, created_at: '2026-11-14T00:05:00+03:00', when_set_at: '2026-11-14T00:05:00+03:00' });
  assert.equal(isNewTask(copy, T, null), true);
  assert.equal(arrivalOf(copy, T), Date.parse('2026-11-14T00:05:00+03:00'));
});

test('Новые · копия, созданная сразу при включении повтора (приложение ставит new_seen_at) — не новая', () => {
  const at = '2026-11-14T15:00:00+03:00';
  const copy = task('m', { when_date: T, repeat_template_id: 'tpl', repeat_date: T, created_at: at, when_set_at: at, new_seen_at: at });
  assert.equal(isNewTask(copy, T, null), false);
  // Какие копии отметить «видел» после включения повтора: только этого шаблона и только созданные с момента нажатия.
  const since = Date.parse('2026-11-14T14:59:59+03:00');
  const list = [
    task('n1', { repeat_template_id: 'tpl', created_at: at }),
    task('n2', { repeat_template_id: 'tpl', created_at: '2026-11-13T10:00:00+03:00' }),
    task('n3', { repeat_template_id: 'other', created_at: at }),
  ];
  assert.deepEqual(copiesCreatedSince(list, 'tpl', since).map((t) => t.id), ['n1']);
});

test('Новые · «OK» после прихода гасит; открытие задачи гасит её точку; пришла позже OK — снова новая', () => {
  const t = task('p', { when_date: T, when_set_at: '2026-11-10T12:00:00+03:00' });
  assert.equal(isNewTask(t, T, '2026-11-14T08:00:00+03:00'), false);
  assert.equal(isNewTask(t, T, '2026-11-13T22:00:00+03:00'), true);      // OK вчера вечером — не гасит сегодняшний приход
  assert.equal(isNewTask({ ...t, new_seen_at: '2026-11-14T09:00:00+03:00' }, T, null), false);
  const late = task('q', { when_date: T, repeat_template_id: 'tpl', created_at: '2026-11-14T12:00:00+03:00' });
  assert.equal(isNewTask(late, T, '2026-11-14T08:00:00+03:00'), true);
});
