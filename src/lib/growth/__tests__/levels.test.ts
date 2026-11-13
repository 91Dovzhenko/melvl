import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelInfo, levelTable, minutesForLevel, LEVEL_TABLE_ROWS } from '../levels.ts';

test('Уровни · навык 3×√n: пороги 2/3/4 = 3:00 / 7:15 / 12:26', () => {
  assert.equal(minutesForLevel('skill', 1), 0);
  assert.equal(minutesForLevel('skill', 2), 180);   // 3 ч
  assert.equal(minutesForLevel('skill', 3), 435);   // 3 + 4,24 = 7,24 ч
  assert.equal(minutesForLevel('skill', 4), 746);   // + 5,20 = 12,44 ч
});

test('Уровни · ветка 6+n: пороги 2/3/5 = 7 / 15 / 34 ч', () => {
  assert.equal(minutesForLevel('branch', 2), 420);
  assert.equal(minutesForLevel('branch', 3), 900);
  assert.equal(minutesForLevel('branch', 5), 2040);
});

test('Уровни · общий 12+1,5n: пороги 2/3/4/50 = 13,5 / 28,5 / 45 / 2 425,5 ч', () => {
  assert.equal(minutesForLevel('total', 2), 810);
  assert.equal(minutesForLevel('total', 3), 1710);
  assert.equal(minutesForLevel('total', 4), 2700);
  assert.equal(minutesForLevel('total', 50), 145530);
});

test('Уровни · 0 ч = уровень 1, до 2 — 3:00, прогресс 0', () => {
  assert.deepEqual(levelInfo('skill', 0), { level: 1, minutes: 0, floor: 0, next: 180, toNext: 180, progress: 0 });
});

test('Уровни · граница: 2:59 — ур. 1 (до 2 — 0:01), 3:00 — ур. 2 (до 3 — 4:15)', () => {
  assert.equal(levelInfo('skill', 179).level, 1);
  assert.equal(levelInfo('skill', 179).toNext, 1);
  const l2 = levelInfo('skill', 180);
  assert.equal(l2.level, 2);
  assert.equal(l2.toNext, 255);
});

test('Уровни · прогресс внутри уровня: 5:00 у навыка = ур. 2, 47%', () => {
  const i = levelInfo('skill', 300);
  assert.equal(i.level, 2);
  assert.equal(Math.round(i.progress * 100), 47); // (300 − 180) / 255
});

test('Окно «i» · строки 2–16 и 50 из тех же формул: «Всего» даёт ровно этот уровень', () => {
  for (const kind of ['skill', 'branch', 'total'] as const) {
    const rows = levelTable(kind, LEVEL_TABLE_ROWS);
    assert.equal(rows.length, 16);
    for (const r of rows) {
      assert.equal(levelInfo(kind, r.total).level, r.level);
      assert.equal(levelInfo(kind, r.total - 1).level, r.level - 1);
      assert.equal(r.step, r.total - minutesForLevel(kind, r.level - 1));
    }
  }
  assert.deepEqual(levelTable('skill', [2, 3]), [{ level: 2, step: 180, total: 180 }, { level: 3, step: 255, total: 435 }]);
});
