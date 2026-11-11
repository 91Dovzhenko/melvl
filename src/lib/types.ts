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
  created_at: string; deleted_at: string | null;
};

export type Skill = {
  id: string; name: string; branch: 'creator' | 'profession'; icon: string;
  active: boolean; sort_order: number; deleted_at: string | null;
};

export type Settings = {
  log_mode: 'immediately' | 'daily' | 'manual';
  today_view: 'projects' | 'list';
  last_auto_log: string | null;
};

export type Tables = {
  areas: Area; projects: Project; tasks: Task; skills: Skill;
};
export type TableName = keyof Tables;
