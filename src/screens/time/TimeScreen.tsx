// Раздел «Время» (21_ТЗ): вкладки День · Сводка · Проекты. Последняя открытая вкладка запоминается на устройстве.
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { useNewTaskContext } from '../../tasks/editing';
import { Icon } from '../../ui/icons';
import { useIsPhone } from '../../ui/useIsPhone';
import { DayView } from './Day';
import { SummaryView } from './Summary';
import { ProjectsView } from './Projects';
import './time.css';

const TABS = [
  { key: 'day', label: 'День' },
  { key: 'summary', label: 'Сводка' },
  { key: 'projects', label: 'Проекты' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TAB_STORE = 'melvl.time.tab';

function savedTab(): TabKey {
  try {
    const v = localStorage.getItem(TAB_STORE);
    return (TABS.find((t) => t.key === v)?.key ?? 'day');
  } catch { return 'day'; }
}

export function TimeScreen() {
  const { tab } = useParams();
  const phone = useIsPhone();
  const store = useStore();
  useNewTaskContext({ defaults: {}, list: [], onNew: () => {} });
  const cur = TABS.find((t) => t.key === tab)?.key;
  useEffect(() => { if (cur) try { localStorage.setItem(TAB_STORE, cur); } catch { /* приватный режим */ } }, [cur]);
  if (!cur) return <Navigate to={`/time/${savedTab()}`} replace />;

  const tabs = (
    <nav className="time-tabs" aria-label="Вкладки раздела «Время»">
      {TABS.map((t) => (
        <Link key={t.key} to={`/time/${t.key}`} className={t.key === cur ? 'on' : ''} aria-current={t.key === cur ? 'page' : undefined} replace>{t.label}</Link>
      ))}
    </nav>
  );
  const noCatalog = !store.loading && store.time_categories.filter((c) => !c.deleted_at).length === 0;

  return (
    <>
      <header className="screen-head" style={phone ? { flexDirection: 'column', alignItems: 'stretch', gap: 12 } : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div className="screen-title">
          <span className="title-badge lime"><Icon name="time" size={22} width={1.9} /></span>
          <h1 className="title">Время</h1>
        </div>
        {tabs}
      </header>
      {noCatalog ? (
        <div className="tset-empty" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Категорий пока нет</span>
          <span className="set-sub" style={{ maxWidth: 420, lineHeight: 1.5 }}>Заведи категории и направления в Настройках — и здесь можно будет отмечать время.</span>
          <Link to="/settings/time" className="tset-lime" style={{ textDecoration: 'none', marginTop: 8 }}>Открыть «Учёт времени»</Link>
        </div>
      ) : cur === 'day' ? <DayView /> : cur === 'summary' ? <SummaryView /> : <ProjectsView />}
    </>
  );
}
