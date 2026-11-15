// Общее для экранов «Времени»: момент по Москве (тик раз в 30 с и при возврате в окно), справочник для подписей.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { mskNow, type MskNow } from '../../lib/time/clock';
import type { Catalog } from '../../lib/time/day';

export function useMskNow(): MskNow {
  const [now, setNow] = useState(() => mskNow());
  useEffect(() => {
    const tick = () => setNow((p) => { const n = mskNow(); return n.date === p.date && n.min === p.min ? p : n; });
    const id = window.setInterval(tick, 30_000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', tick); };
  }, []);
  return now;
}

/** Справочник для подписей: всё, включая архив; проекты — вместе с удалёнными, на которые отмечено время. */
export function useCatalog(): Catalog {
  const s = useStore();
  return useMemo(() => ({
    categories: s.time_categories, directions: s.time_directions, stages: s.time_stages,
    projects: [...s.projects, ...s.timeProjects],
  }), [s.time_categories, s.time_directions, s.time_stages, s.projects, s.timeProjects]);
}
