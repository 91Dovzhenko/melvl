# ME:LVL — задачи

Личный менеджер задач: React + TypeScript + Vite (PWA), Supabase (Postgres, Auth Google, Realtime), GitHub Pages.

## Локально

```bash
npm install
cp .env.example .env.local   # вписать URL проекта и anon key
npm run dev                  # http://localhost:5173/melvl/
```

Просмотр каркаса без входа (только dev, выдуманные данные): http://localhost:5173/melvl/?preview

## База

Миграции — `supabase/migrations/`. Применяются по порядку в Supabase → SQL Editor.

## Деплой

Push в `main` → GitHub Actions собирает и публикует на Pages.
Значения `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` — в Settings → Secrets and variables → Actions → **Variables**.
Ключ `service_role` в репозиторий и код не кладётся никогда.
