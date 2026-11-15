// Учёт времени (этап 5, 21_ТЗ): типы строк базы (миграция 0007_time.sql).

export type TimeStatus = 'active' | 'archived';
export type NormType = 'none' | 'daily' | 'monthly';

export type TimeCategory = {
  id: string; name: string;
  /** Ключ палитры (palette.ts). */
  color: string;
  status: TimeStatus; sort_order: number; deleted_at: string | null;
};

export type TimeDirection = {
  id: string; category_id: string; name: string; status: TimeStatus;
  norm_type: NormType;
  /** Минуты: 360 — «6:00 в рабочий день», 6000 — «100:00 в месяц». */
  norm_min: number;
  /** Область задач: на шаге «Проект» — только её открытые проекты. */
  area_id: string | null;
  sort_order: number; deleted_at: string | null;
};

export type TimeStage = {
  id: string; direction_id: string; name: string; status: TimeStatus;
  sort_order: number; deleted_at: string | null;
};

/** Значение слота: категория обязательна, остальное — по желанию. */
export type SlotValue = {
  category_id: string;
  direction_id: string | null;
  project_id: string | null;
  stage_id: string | null;
};

/** Отметка слота. Пустой слот — строки нет. Ключ — (date, slot). */
export type TimeSlot = SlotValue & {
  /** День по Москве, YYYY-MM-DD. */
  date: string;
  /** 0–47; 0 = 00:00–00:30. */
  slot: number;
  /** Время изменения — для «Последних». */
  updated_at: string;
};

export type TimeWeekSchedule = {
  id: string; direction_id: string;
  /** Понедельник недели, YYYY-MM-DD. */
  week_start: string;
  /** Маска рабочих дней: 7 бит, пн = бит 0. */
  days: number;
};

/** Таблица «Сводки»: направление или категория. */
export type SummaryTable = { kind: 'direction' | 'category'; id: string };

export const SLOTS = 48;
export const SLOT_MIN = 30;
