export type Status = 'open' | 'completed' | 'canceled';

export type Area = {
  id: string; name: string; sort_order: number; deleted_at: string | null;
};

export type Project = {
  id: string; area_id: string | null; name: string; notes: string;
  default_skill_id: string | null; is_quest: boolean; quest_estimate_min: number | null;
  status: Status; completed_at: string | null; logged_at: string | null;
  sort_order: number; deleted_at: string | null;
};

export type Task = {
  id: string; project_id: string | null; area_id: string | null;
  title: string; notes: string;
  when_date: string | null; when_evening: boolean; someday: boolean;
  estimate_min: number | null; skill_id: string | null; deadline: string | null;
  status: Status; completed_at: string | null; logged_at: string | null;
  sort_order: number; today_order: number;
  repeat_template_id: string | null; repeat_date: string | null;
  /** Шаблон повтора: в списках не показывается, по нему создаются копии. */
  is_template: boolean;
  /** Привычка: копия повтора-привычки (флажок наследуется от правила). */
  is_habit: boolean;
  created_at: string; deleted_at: string | null;
};

export type Skill = {
  id: string; name: string; branch: 'creator' | 'profession'; icon: string;
  active: boolean; sort_order: number; deleted_at: string | null;
  /** Есть в базе; у новых навыков — для метки «новый». */
  created_at?: string;
};

// ───────────── Цели (этап 2, миграция 0005) ─────────────
export type GoalCalc = 'once' | 'average';
export type PeriodUnit = 'week' | 'month';
export type GoalStatus = 'active' | 'paused' | 'canceled' | 'achieved';

export type Goal = {
  id: string; title: string;
  /** Метрика — она же единица («подписчики», «₽ с контента/мес»). */
  metric: string;
  start_value: number; target_value: number; criterion: string;
  calc: GoalCalc; period_n: number; period_unit: PeriodUnit;
  due_date: string | null; review_date: string | null;
  status: GoalStatus; achieved_at: string | null;
  sort_order: number; deleted_at: string | null;
};

export type GoalStep = {
  id: string; goal_id: string; title: string; threshold: number;
  /** 'goal' — как у цели. */
  calc: 'goal' | GoalCalc;
  taken_at: string | null; taken_manual: boolean;
  sort_order: number; deleted_at: string | null;
};

export type GoalMeasurement = {
  id: string; goal_id: string; date: string; value: number; comment: string; deleted_at: string | null;
};

/** Застывшая раскладка дерева навыков (Mac): подпись набора навыков и позиции узлов. */
export type TreeLayoutStore = { sig: string; w: number; h: number; nodes: Record<string, [number, number]> };

export type Settings = {
  log_mode: 'immediately' | 'daily' | 'manual';
  today_view: 'projects' | 'list';
  last_auto_log: string | null;
  /** Последнее открытие «Персонажа» — для точки-бейджа. */
  character_seen_at: string | null;
  tree_layout: TreeLayoutStore | null;
};

export type Tables = {
  areas: Area; projects: Project; tasks: Task; skills: Skill;
  goals: Goal; goal_steps: GoalStep; goal_measurements: GoalMeasurement;
};
export type TableName = keyof Tables;
