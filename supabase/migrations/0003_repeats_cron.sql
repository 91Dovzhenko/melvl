-- ME:LVL — расписание повторов: каждый день в 00:05 по Москве (21:05 UTC; в Москве нет перехода на летнее время).
-- Применить после 0002_repeats.sql: Supabase → SQL Editor → Run.

create extension if not exists pg_cron with schema pg_catalog;

-- Пересоздать задачу расписания, если она уже есть.
select cron.unschedule(jobid) from cron.job where jobname = 'melvl-repeats';
select cron.schedule('melvl-repeats', '5 21 * * *', $$select public.generate_repeats_all()$$);

-- Проверка: должна быть одна строка с расписанием '5 21 * * *'.
select jobname, schedule, active from cron.job where jobname = 'melvl-repeats';
