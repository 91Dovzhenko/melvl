// Перетаскивание (19_ТЗ): расчёт нового порядка и правила «куда можно». Чистые функции — с тестами.
// Порядок хранится дробным числом (sort_order / today_order — double precision): перестановка меняет одну запись —
// новое значение между соседями. Если соседи совпадают (например, копия повтора унаследовала sort_order шаблона)
// или зазор исчерпан — группа перенумеровывается целиком (редкий случай).

export type Ordered = { id: string; order: number };
export type OrderChange = { id: string; order: number };

const EPS = 1e-6;

/**
 * Поставить элемент movingId на позицию index в списке others (others — в порядке показа, без самого элемента).
 * Возвращает изменения порядка: обычно одно — у перетаскиваемого; при совпадении соседей — всю группу.
 * current — текущее значение (список пуст — порядок не меняется).
 */
export function placeAt(others: Ordered[], index: number, movingId: string, current: number): OrderChange[] {
  const i = Math.max(0, Math.min(index, others.length));
  const prev = others[i - 1], next = others[i];
  if (!prev && !next) return [{ id: movingId, order: current }];
  if (!prev) return [{ id: movingId, order: next.order - 1 }];
  if (!next) return [{ id: movingId, order: prev.order + 1 }];
  if (next.order - prev.order > EPS) return [{ id: movingId, order: (prev.order + next.order) / 2 }];
  // Соседи совпадают или стоят не по порядку — перенумеровать группу с шагом 1 от первого значения.
  const ids = [...others.slice(0, i).map((o) => o.id), movingId, ...others.slice(i).map((o) => o.id)];
  const start = Math.min(others[0].order, current);
  const was = new Map(others.map((o) => [o.id, o.order]));
  was.set(movingId, current);
  return ids.map((id, k) => ({ id, order: start + k })).filter((c) => c.id === movingId || was.get(c.id) !== c.order);
}

/**
 * Позиция плашки в списке, где часть мест недопустима (проект: задача не уходит из своей группы).
 * groups — группы остальных элементов по порядку показа; own — группа перетаскиваемого;
 * desired — куда указывает курсор (0…n); origin — откуда взяли (на случай, когда задача в группе одна).
 * Допустимы места рядом с элементом своей группы. Возвращает ближайшее допустимое и признак «курсор над допустимым».
 */
export function resolveSlot(groups: string[], own: string, desired: number, origin: number): { index: number; valid: boolean } {
  const n = groups.length;
  const ok = (i: number) => groups[i - 1] === own || groups[i] === own;
  const allowed: number[] = [];
  for (let i = 0; i <= n; i++) if (ok(i)) allowed.push(i);
  if (allowed.length === 0) allowed.push(Math.max(0, Math.min(origin, n)));
  const d = Math.max(0, Math.min(desired, n));
  if (allowed.includes(d)) return { index: d, valid: true };
  let best = allowed[0];
  for (const i of allowed) if (Math.abs(i - d) < Math.abs(best - d)) best = i;
  return { index: best, valid: false };
}

/** Списки «Сегодня»: ключ группы — проект, область, 'none' (без проекта), 'flat' («Списком»), 'evening'. */
export type TodayDrop =
  | { ok: false }
  | { ok: true; evening: boolean; key: 'sort_order' | 'today_order' | null };

/**
 * «Сегодня» (19_ТЗ, 2.1): из какой группы в какую можно и что меняется.
 * from — группа, где задача сейчас; to — группа под курсором; home — «своя» дневная группа задачи
 * (проект, область или 'none'; в «Списком» — 'flat').
 * По проектам порядок внутри дневной группы — общий с проектом (sort_order); «Вечером» и «Списком» — свой (today_order).
 * Вечернюю можно бросить в любую дневную группу (решение 15 нояб.): она станет дневной и встанет в группу
 * своего проекта — порядок тогда не меняется (key: null).
 */
export function todayDrop(from: string, to: string, home: string): TodayDrop {
  if (to === 'evening') return { ok: true, evening: true, key: 'today_order' };
  if (to === home) return { ok: true, evening: false, key: to === 'flat' ? 'today_order' : 'sort_order' };
  if (from === 'evening') return { ok: true, evening: false, key: null };
  return { ok: false };
}

/** Что произойдёт с задачей, брошенной на пункт бокового меню; null — ничего не меняется. */
export type NavTarget = { kind: 'inbox' } | { kind: 'today' } | { kind: 'project'; id: string } | { kind: 'area'; id: string };
export type TaskLite = { project_id: string | null; area_id: string | null; when_date: string | null; when_evening: boolean; someday: boolean };

export function navDropChanges(t: TaskLite, target: NavTarget, today: string): Partial<TaskLite> | null {
  switch (target.kind) {
    case 'inbox':
      // Во «Входящие»: дата и проект снимаются.
      if (!t.project_id && !t.area_id && !t.when_date && !t.someday) return null;
      return { project_id: null, area_id: null, when_date: null, when_evening: false, someday: false };
    case 'today':
      // На «Сегодня»: дата — сегодня, дневная.
      if (t.when_date === today && !t.when_evening && !t.someday) return null;
      return { when_date: today, when_evening: false, someday: false };
    case 'project':
      // В проект: дата сохраняется (у задачи проекта область не хранится — как в «Переместить»).
      if (t.project_id === target.id) return null;
      return { project_id: target.id, area_id: null };
    case 'area':
      // В область без проекта.
      if (!t.project_id && t.area_id === target.id) return null;
      return { project_id: null, area_id: target.id };
  }
}
