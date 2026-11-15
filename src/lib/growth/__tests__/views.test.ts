import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderProjectTasks } from '../../views.ts';
import { task } from './fixtures.ts';

const T = '2026-11-14';
const mk = (id: string, created: string, o: Parameters<typeof task>[1] = {}) => task(id, { project_id: 'p', created_at: `2026-11-0${created}T10:00:00Z`, ...o });

test('Порядок в проекте · сегодня (дневные, потом вечер) → без даты → будущее с шаблонами → «Ожидание» → «Когда-нибудь»', () => {
  const list = [
    mk('someday', '1', { someday: true }),
    mk('wait', '1', { is_template: true }),                       // открыта копия → «Ожидание»
    mk('tplFuture', '2', { is_template: true }),                  // следующая копия 16 нояб.
    mk('fut20', '1', { when_date: '2026-11-20' }),
    mk('fut16', '3', { when_date: '2026-11-16' }),
    mk('nodate2', '5'), mk('nodate1', '2'),
    mk('eve', '1', { when_date: T, when_evening: true }),
    mk('overdue', '4', { when_date: '2026-11-10' }),              // просроченная — вместе с «Сегодня»
    mk('day', '2', { when_date: T }),
  ];
  const copy = task('copy', { repeat_template_id: 'wait', when_date: T, status: 'open' });
  const rules = [{ task_id: 'wait', next_date: '2026-11-15' }, { task_id: 'tplFuture', next_date: '2026-11-16' }];
  // На одну дату (16 нояб.) — по созданию: шаблон создан 2-го, задача 3-го.
  assert.deepEqual(orderProjectTasks(list, [...list, copy], rules, T).map((t) => t.id),
    ['day', 'overdue', 'eve', 'nodate1', 'nodate2', 'tplFuture', 'fut16', 'fut20', 'wait', 'someday']);
});
