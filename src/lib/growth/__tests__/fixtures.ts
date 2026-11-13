// Выдуманные данные для тестов расчётов. Время — по Москве (тесты запускаются с TZ=Europe/Moscow).
import type { Goal, GoalMeasurement, GoalStep, Project, Skill, Task } from '../../types.ts';

export const at = (day: string, time = '10:00') => `${day}T${time}:00+03:00`;

export function skill(id: string, branch: string, sort: number, extra: Partial<Skill> = {}): Skill {
  return { id, name: id, branch: branch as Skill['branch'], icon: '', active: true, sort_order: sort, deleted_at: null, ...extra };
}

export function project(id: string, extra: Partial<Project> = {}): Project {
  return {
    id, area_id: null, name: id, notes: '', default_skill_id: null, is_quest: false, quest_estimate_min: null,
    status: 'open', completed_at: null, logged_at: null, sort_order: 0, deleted_at: null, ...extra,
  };
}

/** Выполненная задача: день и время по Москве, оценка (мин), навык, проект. */
export function done(id: string, day: string, est: number | null, skillId: string | null, projectId: string | null = null, time = '10:00', extra: Partial<Task> = {}): Task {
  return task(id, { status: 'completed', completed_at: at(day, time), estimate_min: est, skill_id: skillId, project_id: projectId, ...extra });
}

export function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, project_id: null, area_id: null, title: id, notes: '', when_date: null, when_evening: false, someday: false,
    estimate_min: null, skill_id: null, deadline: null, status: 'open', completed_at: null, logged_at: null,
    sort_order: 0, today_order: 0, repeat_template_id: null, repeat_date: null, is_template: false, is_habit: false,
    created_at: '2026-01-01T00:00:00Z', deleted_at: null, ...extra,
  };
}

export function goal(extra: Partial<Goal> = {}): Goal {
  return {
    id: 'g', title: 'Цель', metric: 'подписчики', start_value: 0, target_value: 10000, criterion: '',
    calc: 'once', period_n: 3, period_unit: 'month', due_date: null, review_date: null,
    status: 'active', achieved_at: null, sort_order: 0, deleted_at: null, ...extra,
  };
}

export function steps(list: [number, string | null, GoalStep['calc']?][]): GoalStep[] {
  return list.map(([threshold, taken_at, calc], i) => ({
    id: 'st' + threshold, goal_id: 'g', title: String(threshold), threshold, calc: calc ?? 'goal',
    taken_at, taken_manual: false, sort_order: i, deleted_at: null,
  }));
}

export function meas(list: [string, number][]): GoalMeasurement[] {
  return list.map(([date, value], i) => ({ id: 'm' + i, goal_id: 'g', date, value, comment: '', deleted_at: null }));
}
