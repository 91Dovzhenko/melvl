// Новые задачи в «Сегодня» (п. 9, 17_ТЗ). Граница «сегодня» — локальный день устройства (Europe/Moscow).
// Новая — задача пришла сама: (а) её дата поставлена до сегодняшнего дня и наступила сегодня;
// (б) копия повтора, созданная сегодня (расписанием или генерацией при открытии приложения / после полуночи).
// Не новая: перешедшие со вчера (дата в прошлом), поставленные на сегодня руками сегодня,
// копия, созданная сразу при включении повтора (приложение ставит ей new_seen_at), выполненные.
import type { Task } from './types.ts';
import { iso, parseISO } from './dates.ts';

const dayOf = (ts: string) => iso(new Date(ts));

/** Момент, когда задача «пришла» в «Сегодня» (мс), или null — не пришла сама. */
export function arrivalOf(t: Task, today: string): number | null {
  if (t.status !== 'open' || t.deleted_at || t.is_template || t.someday || t.when_date !== today) return null;
  if (t.repeat_template_id && dayOf(t.created_at) === today) return Date.parse(t.created_at);
  if (t.when_set_at && dayOf(t.when_set_at) < today) return parseISO(today).getTime();
  return null;
}

/** Точка «новая»: пришла сама, позже последнего «OK» и после прихода её не открывали. */
export function isNewTask(t: Task, today: string, ackAt: string | null): boolean {
  const a = arrivalOf(t, today);
  if (a === null) return false;
  if (ackAt && Date.parse(ackAt) >= a) return false;
  if (t.new_seen_at && Date.parse(t.new_seen_at) >= a) return false;
  return true;
}

/**
 * Копии шаблона, созданные с момента since (мс), ещё без отметки «видел», — их создало приложение
 * сразу при включении повтора: это ручное действие, точку им не ставим.
 */
export function copiesCreatedSince(tasks: Task[], templateId: string, since: number): Task[] {
  return tasks.filter((t) => t.repeat_template_id === templateId && !t.new_seen_at && Date.parse(t.created_at) >= since);
}
