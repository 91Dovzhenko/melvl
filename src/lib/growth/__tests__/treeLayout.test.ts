import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeLayout, treeSig, TREE_W } from '../treeLayout.ts';

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => p + i);

/** Хитбоксы (узел + 8 по высоте) соседних узлов одной стороны не пересекаются. */
function noOverlap(g: ReturnType<typeof treeLayout>) {
  for (const side of [-1, 1]) {
    const col = Object.values(g.nodes).filter((n) => n.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) {
      const gap = col[i].y - col[i - 1].y;
      assert.ok(gap >= Math.max(col[i].d, col[i - 1].d) + 8 - 1e-9, `зазор ${gap} у стороны ${side}`);
    }
  }
}

test('Дерево · 7 + 3 навыка: узлы 64, шаг 90, база 830, ширина 900, хитбоксы не пересекаются', () => {
  const g = treeLayout([{ key: 'creator', skills: ids('c', 7) }, { key: 'profession', skills: ids('p', 3) }]);
  assert.equal(g.w, TREE_W);
  assert.equal(g.h, 830);
  assert.equal(g.nodes.c0.d, 64);
  assert.equal(g.nodes.c1.y - g.nodes.c0.y, 90);
  assert.ok(g.nodes.c3.x < g.hubs[0].x && g.nodes.p1.x > g.hubs[1].x);   // Креатор слева, Профессия справа
  noOverlap(g);
});

test('Дерево · 10 навыков в ветке: шаг до минимума 72, высота ещё база', () => {
  const g = treeLayout([{ key: 'creator', skills: ids('c', 10) }, { key: 'profession', skills: ids('p', 3) }]);
  assert.equal(g.nodes.c1.y - g.nodes.c0.y, 72);
  assert.equal(g.h, 830);
  noOverlap(g);
});

test('Дерево · 15 навыков: узел 48, шаг 56, область растёт в высоту, ширина та же', () => {
  const g = treeLayout([{ key: 'creator', skills: ids('c', 15) }, { key: 'profession', skills: ids('p', 3) }]);
  assert.equal(g.nodes.c0.d, 48);
  assert.equal(g.nodes.c1.y - g.nodes.c0.y, 56);
  assert.equal(g.h, 830 + 14 * 56 - 648);
  assert.equal(g.w, TREE_W);
  noOverlap(g);
});

test('Дерево · 3 ветки: первая слева, правые полосами друг под другом, у каждой свой переключатель', () => {
  const g = treeLayout([{ key: 'creator', skills: ids('c', 7) }, { key: 'profession', skills: ids('p', 3) }, { key: 'body', skills: ids('b', 4) }]);
  assert.equal(g.hubs.length, 3);
  const [, pr, bd] = g.hubs;
  assert.ok(pr.y < bd.y);
  assert.ok(g.nodes.p2.y + 32 < bd.chipY, 'ветки справа не налезают друг на друга');
  noOverlap(g);
});

test('Дерево · раскладка застывшая: тот же набор — те же координаты; подпись меняется при добавлении и скрытии', () => {
  const a = [{ key: 'creator', skills: ['c0', 'c1'] }, { key: 'profession', skills: ['p0'] }];
  assert.deepEqual(treeLayout(a), treeLayout(a));
  assert.notEqual(treeSig(a), treeSig([{ key: 'creator', skills: ['c0', 'c1', 'c2'] }, a[1]]));
  assert.notEqual(treeSig(a), treeSig([{ key: 'creator', skills: ['c0'] }, a[1]]));
});
