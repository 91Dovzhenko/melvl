import { addDays, todayISO } from './dates';
import type { Data } from './store';
import type { Task } from './types';

// Выдуманные данные для локального просмотра (?preview). Реальных задач здесь быть не должно.
const t = todayISO();
let n = 0;
const task = (o: Partial<Task>): Task => ({
  id: `t${++n}`, project_id: null, area_id: null, title: '', notes: '', when_date: null, when_evening: false,
  someday: false, estimate_min: null, skill_id: null, deadline: null, status: 'open', completed_at: null,
  logged_at: null, sort_order: n, today_order: n, repeat_template_id: null, repeat_date: null, is_template: false, is_habit: false,
  created_at: '', deleted_at: null, ...o,
});

export const PREVIEW_SEED: Partial<Data> = {
  areas: [
    { id: 'a1', name: 'Работа', sort_order: 1, deleted_at: null },
    { id: 'a2', name: 'Учёба', sort_order: 2, deleted_at: null },
  ],
  projects: [
    { id: 'p1', area_id: 'a1', name: 'Запуск нового лендинга', notes: 'Черновик структуры готов.', default_skill_id: 's8', is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 1, deleted_at: null },
    { id: 'p2', area_id: 'a1', name: 'Квартальный отчёт для команды с очень длинным названием', notes: '', default_skill_id: null, is_quest: true, quest_estimate_min: 480, status: 'open', completed_at: null, logged_at: null, sort_order: 2, deleted_at: null },
    { id: 'p3', area_id: 'a2', name: 'Курс по рисованию', notes: '', default_skill_id: null, is_quest: false, quest_estimate_min: null, status: 'open', completed_at: null, logged_at: null, sort_order: 1, deleted_at: null },
  ],
  tasks: [
    task({ project_id: 'p1', title: 'Собрать тексты для первого экрана', when_date: t, estimate_min: 45 }),
    task({ project_id: 'p1', title: 'Согласовать цвета с дизайнером', when_date: t, estimate_min: 30, status: 'completed', completed_at: new Date().toISOString() }),
    task({ project_id: 'p1', title: 'Подготовить форму заявки', when_date: addDays(t, 2), estimate_min: 60, notes: 'Поля: имя, почта' }),
    task({ project_id: 'p1', title: 'Сделать короткую версию для соцсетей', someday: true, estimate_min: 60 }),
    task({ project_id: 'p1', title: 'Разобрать отзывы', when_date: addDays(t, 12) }),
    task({ project_id: 'p2', title: 'Выгрузить цифры за квартал', when_date: t, estimate_min: 90 }),
    task({ project_id: 'p3', title: 'Нарисовать три скетча', when_date: t, when_evening: true, estimate_min: 60 }),
    task({ title: 'Позвонить в сервис', when_date: t, estimate_min: 15 }),
    task({ title: 'Идея: заметки голосом' }),
    task({ title: 'Купить подарок к выходным', when_date: addDays(t, 1), estimate_min: 30 }),
    task({ project_id: 'p3', title: 'Купить скетчбук', when_date: addDays(t, 1), estimate_min: 15 }),
  ],
  skills: ([
    ['Упаковка', 'creator', 'frame'], ['Сценарий', 'creator', 'pencil'], ['Речь на камеру', 'creator', 'mic'],
    ['Съёмка', 'creator', 'video'], ['Монтаж', 'creator', 'scissors'], ['Маркетинг', 'creator', 'megaphone'],
    ['ИИ и агентные системы', 'creator', 'sparkles'], ['Продукт', 'profession', 'cube'],
    ['Внедрение ИИ', 'profession', 'gear'], ['Финансы', 'profession', 'chart'],
  ] as const).map(([name, branch, icon], i) => ({ id: `s${i + 1}`, name, branch, icon, active: true, sort_order: i + 1, deleted_at: null })),
};
