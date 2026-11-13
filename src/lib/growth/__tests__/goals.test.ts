import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageAt, currentValue, fmtNum, forecast, forecastText, leftText, nextStep, nextStepLeft, pace, parseNum, reachedByRule, shiftBack, stepsTakenBy,
} from '../goals.ts';
import { goal, meas, steps } from './fixtures.ts';

// Пример с холста: «YouTube — 10 000 подписчиков», один раз, период 3 мес.
const YT = goal({ title: 'YouTube — 10 000 подписчиков' });
const YT_MS = meas([['2026-10-01', 410], ['2026-10-20', 520], ['2026-11-01', 870], ['2026-11-10', 955]]);
const YT_STEPS = steps([[500, '2026-10-20'], [2000, null], [3000, null], [4000, null], [5000, null], [6500, null], [8000, null], [10000, null]]);
const TODAY = '2026-11-13';
const NB = ' ';

test('Цели · текущее значение — последний замер по дате (порядок ввода не важен)', () => {
  assert.equal(currentValue([...YT_MS].reverse()), 955);
  assert.equal(currentValue([]), null);
});

test('Цели · следующая ступень 2 000, осталось 1 045', () => {
  const n = nextStep(YT_STEPS, YT_MS)!;
  assert.deepEqual([n.step.threshold, n.left], [2000, 1045]);
});

test('Темп · цель моложе периода — с первого замера: +415 в месяц (410 → 955 за 40 дней)', () => {
  const p = pace(YT, YT_MS)!;
  assert.equal(Math.round(p.perUnit), 415);
  assert.deepEqual([p.unit, p.fromFirst], ['month', true]);
});

test('Темп · цель старше периода — от последнего замера на дату ≤ «последний − 3 мес»: +132 в месяц', () => {
  const ms = meas([['2026-06-01', 100], ['2026-07-01', 200], ['2026-08-01', 300], ['2026-09-01', 400], ['2026-10-01', 600]]);
  const p = pace(goal(), ms)!;
  assert.equal(Math.round(p.perUnit), 132);           // (600 − 200) / (92 дня / 30,44)
  assert.equal(p.fromFirst, false);
});

test('Темп · в неделях: период 4 недели → «+50 в неделю»', () => {
  const p = pace(goal({ period_n: 4, period_unit: 'week' }), meas([['2027-01-01', 100], ['2027-01-15', 200]]))!;
  assert.deepEqual([p.perUnit, p.unit], [50, 'week']);
});

test('Прогноз · «следующая ступень 2 000 — ~ январь 2027» (как на холсте)', () => {
  assert.equal(forecastText(forecast(YT, YT_STEPS, YT_MS, TODAY)), '~ январь 2027');
});

test('Прогноз · меньше месяца — «~ через 4 недели» (после замера 2 030, ступень 3 000)', () => {
  const ms = [...YT_MS, ...meas([['2026-11-13', 2030]]).map((m) => ({ ...m, id: 'new' }))];
  const st = YT_STEPS.map((s) => (s.threshold === 2000 ? { ...s, taken_at: '2026-11-13' } : s));
  assert.equal(Math.round(pace(YT, ms)!.perUnit), 1147);
  assert.equal(forecastText(forecast(YT, st, ms, TODAY)), '~ через 4 недели');
});

test('Прогноз · больше двух лет — только год: «~ 2029»', () => {
  const f = forecast(goal(), steps([[300, null]]), meas([['2026-11-01', 0], ['2026-12-01', 10]]), '2026-12-01');
  assert.equal(forecastText(f), '~ 2029');
});

test('Прогноз · один замер — «появится после второго замера»; темп ≤ 0 — «пока не определён»; всё взято — «все ступени взяты»', () => {
  assert.equal(forecastText(forecast(YT, YT_STEPS, YT_MS.slice(0, 1), TODAY)), 'появится после второго замера');
  assert.equal(forecastText(forecast(YT, YT_STEPS, meas([['2026-10-01', 955], ['2026-11-01', 900]]), TODAY)), 'пока не определён');
  assert.equal(forecastText(forecast(YT, steps([[500, '2026-10-20']]), YT_MS, TODAY)), 'все ступени взяты');
});

test('Прогноз · склонение недель: 1 неделю / 2 недели / 5 недель', () => {
  const st = steps([[1, null]])[0];
  assert.equal(forecastText({ kind: 'weeks', step: st, weeks: 1 }), '~ через 1 неделю');
  assert.equal(forecastText({ kind: 'weeks', step: st, weeks: 2 }), '~ через 2 недели');
  assert.equal(forecastText({ kind: 'weeks', step: st, weeks: 5 }), '~ через 5 недель');
});

test('Ступени «один раз» · замер 2 030 берёт ступень 2 000 с датой замера', () => {
  const saved = { date: '2026-11-13', value: 2030 };
  const r = stepsTakenBy(YT, YT_STEPS, [...YT_MS, ...meas([[saved.date, saved.value]])], saved);
  assert.deepEqual(r.steps.map((s) => s.threshold), [2000]);
  assert.deepEqual([r.last!.threshold, r.more], [2000, 0]);
});

test('Ступени «один раз» · скачок до 6 600 — одна плашка на последнюю: «6 500 + ещё 4»', () => {
  const saved = { date: '2026-11-13', value: 6600 };
  const r = stepsTakenBy(YT, YT_STEPS, YT_MS, saved);
  assert.deepEqual(r.steps.map((s) => s.threshold), [2000, 3000, 4000, 5000, 6500]);
  assert.deepEqual([r.last!.threshold, r.more], [6500, 4]);
});

test('Ступени · упавший замер ступень не снимает: следующая — по-прежнему первая не взятая', () => {
  const st = YT_STEPS.map((s) => (s.threshold === 2000 ? { ...s, taken_at: '2026-11-13' } : s));
  const ms = meas([['2026-11-13', 2030], ['2026-12-01', 1500]]);
  assert.equal(stepsTakenBy(YT, st, ms, { date: '2026-12-01', value: 1500 }).steps.length, 0);
  assert.equal(nextStep(st, ms)!.step.threshold, 3000);
  assert.equal(nextStep(st, ms)!.left, 1500);
});

test('Ступени · ручное «не взята» держится до замера, который снова выполнит правило', () => {
  const st = steps([[500, null]]);                     // сняли вручную
  assert.equal(stepsTakenBy(YT, st, YT_MS, { date: '2026-11-20', value: 400 }).steps.length, 0);
  assert.equal(stepsTakenBy(YT, st, YT_MS, { date: '2026-11-20', value: 600 }).steps.length, 1);
});

test('Подсказка в форме замера · считается на лету по введённому значению', () => {
  const draft = (value: number) => stepsTakenBy(YT, YT_STEPS, [...YT_MS, ...meas([['2026-11-13', value]])], { date: '2026-11-13', value }).last?.threshold ?? null;
  assert.equal(draft(1999), null);
  assert.equal(draft(2000), 2000);
});

// «500 000 ₽/мес», среднее за 3 месяца, ступень 20 000.
const INC = goal({ calc: 'average', metric: '₽ с контента/мес' });
const S20 = steps([[20000, null]]);

test('Среднее · один замер 25 000 — ступень 20 000 не берётся: история короче периода', () => {
  const ms = meas([['2026-12-09', 25000]]);
  assert.equal(averageAt(INC, ms, '2026-12-09'), null);
  assert.equal(stepsTakenBy(INC, S20, ms, { date: '2026-12-09', value: 25000 }).steps.length, 0);
});

test('Среднее · 25 / 5 / 5 тыс. — среднее 11 667 < 20 000, ступень не взята (пример из ТЗ)', () => {
  const ms = meas([['2026-12-09', 25000], ['2027-01-09', 5000], ['2027-02-09', 5000]]);
  assert.equal(Math.round(averageAt(INC, ms, '2027-02-09')!), 11667);
  assert.equal(stepsTakenBy(INC, S20, ms, { date: '2027-02-09', value: 5000 }).steps.length, 0);
});

test('Среднее · 25 / 20 / 18 тыс. — среднее 21 000 ≥ 20 000, ступень взята', () => {
  const ms = meas([['2026-12-09', 25000], ['2027-01-09', 20000], ['2027-02-09', 18000]]);
  assert.equal(stepsTakenBy(INC, S20, ms, { date: '2027-02-09', value: 18000 }).steps.length, 1);
});

test('Среднее · окно (дата − 3 мес; дата]: замер ровно 3 мес назад в среднее не входит', () => {
  const ms = meas([['2026-11-09', 1000], ['2026-12-09', 22000], ['2027-01-09', 22000], ['2027-02-09', 22000]]);
  assert.equal(averageAt(INC, ms, '2027-02-09'), 22000);
});

test('Среднее · своя ступень «один раз» внутри цели «среднее»: 1 000 ₽ берётся одним замером', () => {
  const st = steps([[1000, null, 'once'], [20000, null]]);
  const r = stepsTakenBy(INC, st, meas([['2026-11-01', 1000]]), { date: '2026-11-01', value: 1000 });
  assert.deepEqual(r.steps.map((s) => s.threshold), [1000]);
});

test('Среднее · период в неделях: 4 недели, замеры раз в 2 недели', () => {
  const g4 = goal({ calc: 'average', period_n: 4, period_unit: 'week' });
  assert.equal(averageAt(g4, meas([['2027-01-01', 100], ['2027-01-15', 200], ['2027-01-29', 300]]), '2027-01-29'), 250);
});

test('Прогноз · ступень по среднему: вместо даты — «среднее за 3 мес — 15 000 из 25 000»', () => {
  const ms = meas([['2026-12-09', 10000], ['2027-01-09', 15000], ['2027-02-09', 20000]]);
  assert.equal(forecastText(forecast(INC, steps([[25000, null]]), ms, '2027-02-10')), `среднее за 3 мес — 15${NB}000 из 25${NB}000`);
});

test('Прогноз · по среднему, замеры не покрывают период — «нужно больше замеров за период» (даже если значение выше порога)', () => {
  assert.equal(forecastText(forecast(INC, S20, meas([['2026-12-09', 25000]]), '2026-12-10')), 'нужно больше замеров за период');
  assert.equal(forecastText(forecast(INC, S20, meas([['2026-12-09', 10000], ['2027-01-09', 25000]]), '2027-01-10')), 'нужно больше замеров за период');
  assert.equal(forecastText(forecast(INC, S20, [], '2027-01-10')), 'нужно больше замеров за период');
});

test('Прогноз · правило берётся у следующей ступени: «один раз» в цели «среднее» — дата, «среднее» в цели «один раз» — среднее', () => {
  assert.equal(forecast(INC, steps([[1000, null, 'once'], [20000, null]]), meas([['2026-11-01', 500]]), TODAY).kind, 'needSecond');
  const f = forecast(YT, steps([[500, '2026-10-20'], [2000, null, 'average']]), YT_MS, TODAY);
  assert.equal(forecastText(f), 'нужно больше замеров за период');
  const long = meas([['2026-08-01', 300], ['2026-09-01', 600], ['2026-10-01', 900]]);
  assert.equal(forecastText(forecast(YT, steps([[2000, null, 'average']]), long, TODAY)), `среднее за 3 мес — 600 из 2${NB}000`);
});

test('Достигнута по правилу · активна и взята последняя ступень; пауза, не взята, нет ступеней — нет', () => {
  const all = steps([[500, '2026-10-20'], [10000, '2027-05-01']]);
  assert.equal(reachedByRule(YT, all), true);
  assert.equal(reachedByRule(goal({ status: 'paused' }), all), false);
  assert.equal(reachedByRule(goal({ status: 'achieved' }), all), false);
  assert.equal(reachedByRule(YT, steps([[500, '2026-10-20'], [10000, null]])), false);
  assert.equal(reachedByRule(YT, []), false);
});

test('Достигнута по правилу · добавили ступень выше («Изменить») — плашка уходит сама', () => {
  const s = [...steps([[500, '2026-10-20'], [10000, '2027-05-01']]), ...steps([[12000, null]]).map((x) => ({ ...x, sort_order: 5 }))];
  assert.equal(reachedByRule(YT, s), false);
});

test('Даты · «минус 3 месяца» календарно: 31 мая → 28 февр.', () => {
  assert.equal(shiftBack('2026-05-31', 3, 'month'), '2026-02-28');
  assert.equal(shiftBack('2027-01-29', 4, 'week'), '2027-01-01');
});

test('Числа · пробелы по тысячам: 2 030, 500 000, 1 234,5; ввод — только цифры', () => {
  assert.equal(fmtNum(2030), `2${NB}030`);
  assert.equal(fmtNum(500000), `500${NB}000`);
  assert.equal(fmtNum(1234.5), `1${NB}234,5`);
  assert.equal(fmtNum(999), '999');
  assert.equal(parseNum('2 030'), 2030);
  assert.equal(parseNum('12,5'), 12.5);
  assert.equal(parseNum('abc'), null);
  assert.equal(parseNum(''), null);
});

test('Осталось · ступень по среднему — от среднего: замер 26 000 выше порога 25 000, среднее 17 750 → осталось 7 250', () => {
  const ms = meas([['2026-08-15', 10000], ['2026-09-14', 15000], ['2026-10-14', 20000], ['2026-11-08', 26000]]);
  const n = nextStepLeft(INC, steps([[25000, null]]), ms)!;
  assert.deepEqual([n.base, n.left], [17750, 7250]);
  assert.equal(nextStepLeft(YT, YT_STEPS, YT_MS)!.left, 1045);              // «один раз» — от последнего замера
});

test('Осталось · по среднему, замеры не покрывают период — «нужно больше замеров за период», даже если замер выше порога', () => {
  for (const v of [12000, 26000]) {
    const n = nextStepLeft(INC, S20, meas([['2026-11-09', 5000], ['2026-12-09', v]]))!;
    assert.equal(n.left, null);
    assert.equal(leftText(n), 'нужно больше замеров за период');
  }
  assert.equal(leftText(nextStepLeft(YT, YT_STEPS, YT_MS)!), `осталось 1${NB}045`);
});
