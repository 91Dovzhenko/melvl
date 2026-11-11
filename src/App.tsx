import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/session';
import { StoreProvider, useStore } from './lib/store';
import { PREVIEW_SEED } from './lib/preview';
import { Login } from './screens/Login';
import { Inbox } from './screens/Inbox';
import { Today } from './screens/Today';
import { ProjectScreen } from './screens/Project';
import { AreaScreen } from './screens/Area';
import { Placeholder } from './screens/Section';
import { Popover, Sidebar, useCreateList } from './shell/Sidebar';
import { PhoneMenu } from './shell/PhoneMenu';
import { EditingProvider, useEditing } from './tasks/editing';
import { Icon, Ring } from './ui/icons';
import { useIsPhone } from './ui/useIsPhone';

// Локальный просмотр без входа: только в `npm run dev`, адрес …/melvl/?preview. Данные выдуманные, в базу ничего не пишется.
const PREVIEW = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');

// Прямые ссылки на GitHub Pages: сборка кладёт 404.html = копия index.html, роутер разбирает путь сам.
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      {PREVIEW ? (
        <StoreProvider offline seed={PREVIEW_SEED}>
          <EditingProvider><Shell email="demo@example.com" /></EditingProvider>
        </StoreProvider>
      ) : <Gate />}
    </BrowserRouter>
  );
}

function Gate() {
  const s = useSession();
  if (s.status === 'loading') return <div className="login-page" aria-busy="true" />;
  if (s.status === 'out') return <Login />;
  return (
    <StoreProvider>
      <EditingProvider><Shell email={s.session.user.email ?? ''} /></EditingProvider>
    </StoreProvider>
  );
}

const isField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/**
 * Горячие клавиши. Новая задача: ⌘N (в Chrome-вкладке браузер забирает его себе — открывает окно),
 * поэтому запасные — N или Пробел вне полей ввода (раскладка не важна). Enter — раскрыть выделенную,
 * Delete — удалить, Esc — снять выделение.
 */
function useShortcuts() {
  const ed = useEditing();
  const store = useStore();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        ed.requestNew();
        return;
      }
      // ⌘Z — вернуть удалённое. В полях ввода ⌘Z остаётся обычной отменой набора.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ' && !isField(e.target)) {
        if (store.undo()) e.preventDefault();
        return;
      }
      if (isField(e.target) || ed.editingId || ed.draft) return;
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (plain && (e.code === 'KeyN' || e.code === 'Space')) {
        e.preventDefault();
        ed.requestNew();
        return;
      }
      if (!ed.selectedId) return;
      if (e.key === 'Enter') { e.preventDefault(); ed.open(ed.selectedId); }
      if (e.key === 'Escape') ed.select(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const id = ed.selectedId;
        store.withUndo('Задача удалена', () => store.remove('tasks', id));
        ed.select(null);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [ed, store]);
}

const ROUTES = [
  <Route key="inbox" path="/inbox" element={<Inbox />} />,
  <Route key="today" path="/today" element={<Today />} />,
  <Route key="plans" path="/plans" element={<Placeholder kind="plans" />} />,
  <Route key="log" path="/log" element={<Placeholder kind="log" />} />,
  <Route key="project" path="/project/:id" element={<ProjectScreen />} />,
  <Route key="area" path="/area/:id" element={<AreaScreen />} />,
];

function Shell({ email }: { email: string }) {
  const phone = useIsPhone();
  const ed = useEditing();
  const loc = useLocation();
  useShortcuts();

  // Выделение и раскрытая карточка не переходят в другой раздел.
  useEffect(() => { ed.select(null); ed.close(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const routes = ROUTES;

  if (phone) {
    return (
      <Routes>
        <Route path="/" element={<div className="phone menu-bg"><PhoneMenu email={email} /><PhoneFab menu /></div>} />
        <Route path="*" element={<PhoneList><Routes>{routes}<Route path="*" element={<Navigate to="/" replace />} /></Routes></PhoneList>} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <Sidebar email={email} />
      <main className="panel">
        <div className="content" onMouseDown={(e) => { if (e.target === e.currentTarget) ed.select(null); }}>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            {routes}
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
        <div className="toolbar">
          <button type="button" className="tool" aria-label="Новая задача" title="Новая задача — N или пробел"
            onClick={() => ed.requestNew()}>
            <Icon name="plus" size={18} color="#3E423C" width={2} />
          </button>
          <button type="button" className="tool" aria-label="Когда" title="Когда — следующий пункт сборки" disabled>
            <Icon name="when" size={18} color="#3E423C" />
          </button>
          <button type="button" className="tool" aria-label="Переместить" title="Переместить — следующий пункт сборки" disabled>
            <Icon name="move" size={18} color="#3E423C" />
          </button>
        </div>
      </main>
    </div>
  );
}

function PhoneList({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <div className="phone list-bg" key={loc.pathname}>
      <div className="phone-list">
        <Link to="/" className="phone-back">
          <Icon name="back" size={20} color="#3E423C" width={2.2} />Меню
        </Link>
        {children}
      </div>
      <PhoneFab />
    </div>
  );
}

/** «+» на iPhone: в разделе — новая задача; на экране меню — выбор «задача / проект / область». */
function PhoneFab({ menu }: { menu?: boolean }) {
  const ed = useEditing();
  const create = useCreateList();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'fixed', right: 20, bottom: 'calc(34px + env(safe-area-inset-bottom) * .5)', zIndex: 10 }}>
      {open && (
        <Popover onClose={() => setOpen(false)} style={{ bottom: 70, right: 0 }}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); create.project(); }}>
            <Ring size={16} progress={0} />Новый проект
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); create.area(); }}>
            <Icon name="area" size={16} color="#5F635C" />Новая область
          </button>
        </Popover>
      )}
      <button type="button" className="fab" style={{ position: 'static' }}
        aria-label={menu ? 'Новый проект или область' : 'Новая задача'}
        onClick={() => (menu ? setOpen((v) => !v) : ed.requestNew())}>
        <Icon name="plus" size={26} color="#15171A" width={2.2} />
      </button>
    </div>
  );
}
