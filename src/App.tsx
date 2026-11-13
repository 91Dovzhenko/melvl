import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/session';
import { NavBridge } from './lib/navBridge';
import { useAutoLog, useLogbook } from './lib/logbook';
import { StoreProvider, useStore } from './lib/store';
import { PREVIEW_SEED } from './lib/preview';
import { Login } from './screens/Login';
import { Inbox } from './screens/Inbox';
import { Today } from './screens/Today';
import { ProjectScreen } from './screens/Project';
import { AreaScreen } from './screens/Area';
import { Plans } from './screens/Plans';
import { Log } from './screens/Log';
import { SettingsScreen } from './screens/Settings';
import { CharacterScreen } from './screens/Character';
import { ChapterScreen, ChaptersScreen } from './screens/Chapters';
import { GoalScreen, GoalsScreen } from './screens/Goals';
import { MomentsProvider } from './growth/Moments';
import { AccountProvider } from './lib/account';
import { Sidebar, useCreateList } from './shell/Sidebar';
import { PhoneMenu } from './shell/PhoneMenu';
import { EditingProvider, useEditing } from './tasks/editing';
import { TaskActionBar, TaskPropPicker } from './tasks/actions';
import { PhoneNewTask } from './tasks/PhoneNewTask';
import { Icon, Ring } from './ui/icons';
import { useIsPhone } from './ui/useIsPhone';

// Локальный просмотр без входа: только в `npm run dev`, адрес …/melvl/?preview. Данные выдуманные, в базу ничего не пишется.
const PREVIEW = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');

// Прямые ссылки на GitHub Pages: сборка кладёт 404.html = копия index.html, роутер разбирает путь сам.
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <NavBridge />
      {PREVIEW ? (
        <AccountProvider value={{ email: 'demo@example.com', name: 'Демо' }}>
          <StoreProvider offline seed={PREVIEW_SEED}>
            <EditingProvider><MomentsProvider><Shell /></MomentsProvider></EditingProvider>
          </StoreProvider>
        </AccountProvider>
      ) : <Gate />}
    </BrowserRouter>
  );
}

function Gate() {
  const s = useSession();
  if (s.status === 'loading') return <div className="login-page" aria-busy="true" />;
  if (s.status === 'out') return <Login />;
  const u = s.session.user;
  const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
  return (
    <AccountProvider value={{ email: u.email ?? '', name: meta.full_name || meta.name || '' }}>
      <StoreProvider>
        <EditingProvider><MomentsProvider><Shell /></MomentsProvider></EditingProvider>
      </StoreProvider>
    </AccountProvider>
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
  const { logNow } = useLogbook();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        ed.requestNew();
        return;
      }
      // Shift+⌘Y — выполненное в Журнал.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyY') {
        e.preventDefault();
        logNow();
        return;
      }
      // ⌘Z — вернуть удалённое. В полях ввода ⌘Z остаётся обычной отменой набора.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ' && !isField(e.target)) {
        if (store.undo()) e.preventDefault();
        return;
      }
      // Открыто модальное окно (форма цели, замер, поздравление) — горячие клавиши задач не работают.
      if (isField(e.target) || ed.editingId || ed.draft || document.querySelector('[aria-modal="true"]')) return;
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
  }, [ed, store, logNow]);
}

const ROUTES = [
  <Route key="inbox" path="/inbox" element={<Inbox />} />,
  <Route key="today" path="/today" element={<Today />} />,
  <Route key="plans" path="/plans" element={<Plans />} />,
  <Route key="log" path="/log" element={<Log />} />,
  <Route key="project" path="/project/:id" element={<ProjectScreen />} />,
  <Route key="area" path="/area/:id" element={<AreaScreen />} />,
  <Route key="settings" path="/settings" element={<SettingsScreen />} />,
  <Route key="settings-section" path="/settings/:section" element={<SettingsScreen />} />,
  <Route key="character" path="/character" element={<CharacterScreen />} />,
  <Route key="chapters" path="/chapters" element={<ChaptersScreen />} />,
  <Route key="chapter" path="/chapters/:n" element={<ChapterScreen />} />,
  <Route key="goals" path="/goals" element={<GoalsScreen />} />,
  <Route key="goal" path="/goals/:id" element={<GoalScreen />} />,
];

// Разделы роста — без панели задач внизу (как на холсте).
const GROWTH_PAGE = /^\/(character|chapters|goals)(\/|$)/;


/**
 * Открыта ли экранная клавиатура (iPhone): видимая область заметно ниже окна.
 * Фокус в поле не годится — на iOS поле может быть в фокусе без клавиатуры.
 */
function useKeyboardOpen() {
  const calc = () => {
    const vv = window.visualViewport;
    return !!vv && window.innerHeight - vv.height > 150;
  };
  const [open, setOpen] = useState(calc);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setOpen(calc());
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);
  return open;
}

/** Задача, раскрытая сейчас в карточке (не новая). */
function useOpenTask() {
  const ed = useEditing();
  const store = useStore();
  return ed.editingId ? store.tasks.find((t) => t.id === ed.editingId) ?? null : null;
}

function Shell() {
  const phone = useIsPhone();
  const ed = useEditing();
  const openTask = useOpenTask();
  const loc = useLocation();
  const store = useStore();
  const selectedTask = ed.selectedId ? store.tasks.find((t) => t.id === ed.selectedId) ?? null : null;
  const [barPop, setBarPop] = useState<{ kind: 'when' | 'move'; anchor: HTMLElement } | null>(null);
  useShortcuts();
  useAutoLog();

  // Выделение и раскрытая карточка не переходят в другой раздел.
  useEffect(() => { ed.select(null); ed.close(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const routes = ROUTES;

  if (phone) {
    return (
      <Routes>
        <Route path="/" element={<div className="phone menu-bg"><PhoneMenu />{ed.draft ? <PhoneNewTask /> : <PhoneFab />}</div>} />
        <Route path="*" element={<PhoneList><Routes>{routes}<Route path="*" element={<Navigate to="/" replace />} /></Routes></PhoneList>} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="panel">
        <div className={'content' + (/^\/(character|chapters|goals)(\/|$)/.test(loc.pathname) ? ' content-wide' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) ed.select(null); }}>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            {routes}
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
        {!GROWTH_PAGE.test(loc.pathname) && <div className="toolbar">
          {openTask ? <TaskActionBar task={openTask} /> : (
            <>
              <button type="button" className="tool" aria-label="Новая задача" title="Новая задача — N или пробел"
                onClick={() => ed.requestNew()}>
                <Icon name="plus" size={18} color="#3E423C" width={2} />
              </button>
              <button type="button" className="tool" aria-label="Когда" title={selectedTask ? 'Когда' : 'Когда — выделите задачу'}
                disabled={!selectedTask} onClick={(e) => setBarPop({ kind: 'when', anchor: e.currentTarget })}>
                <Icon name="when" size={18} color="#3E423C" />
              </button>
              <button type="button" className="tool" aria-label="Переместить" title={selectedTask ? 'Переместить' : 'Переместить — выделите задачу'}
                disabled={!selectedTask} onClick={(e) => setBarPop({ kind: 'move', anchor: e.currentTarget })}>
                <Icon name="move" size={18} color="#3E423C" />
              </button>
              {barPop && selectedTask && (
                <TaskPropPicker task={selectedTask} kind={barPop.kind} anchor={barPop.anchor} onClose={() => setBarPop(null)} />
              )}
            </>
          )}
        </div>}
      </main>
    </div>
  );
}

function PhoneList({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const ed = useEditing();
  const openTask = useOpenTask();
  const typing = useKeyboardOpen();
  // Настройки: серый фон с белыми карточками; из раздела настроек — назад в «Настройки».
  const inSettings = loc.pathname.startsWith('/settings');
  const settingsSub = /^\/settings\/[^/]+/.test(loc.pathname);
  // Разделы роста: своя стрелка назад и свои кнопки (у целей — «+» и «Замер»), без «+» задачи.
  const growth = GROWTH_PAGE.test(loc.pathname);
  const back = settingsSub ? { to: '/settings', label: 'Настройки' }
    : /^\/chapters\/[^/]+/.test(loc.pathname) ? { to: '/chapters', label: 'Главы' }
    : loc.pathname.startsWith('/chapters') ? { to: '/character', label: 'Персонаж' }
    : /^\/goals\/[^/]+/.test(loc.pathname) ? { to: '/goals', label: 'Цели' }
    : { to: '/', label: 'Меню' };
  return (
    <div className={'phone ' + (inSettings ? 'menu-bg' : 'list-bg')} key={loc.pathname}>
      <div className="phone-list">
        <Link to={back.to} className="phone-back">
          <Icon name="back" size={20} color="#3E423C" width={2.2} />{back.label}
        </Link>
        {children}
      </div>
      {/* Панель видна, когда карточка открыта; прячется только пока на экране клавиатура. */}
      {!inSettings && !growth && (openTask ? !typing && <TaskActionBar task={openTask} floating /> : !ed.draft && <PhoneFab />)}
      {ed.draft && <PhoneNewTask />}
    </div>
  );
}

/**
 * «+» на iPhone (60, лайм, справа 20, снизу 34): нажатие — новая задача в текущем разделе (на экране меню — во Входящие);
 * долгое нажатие — «Новая задача / Новый проект / Новая область».
 */
function PhoneFab() {
  const ed = useEditing();
  const create = useCreateList();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const long = useRef(false);
  const startPress = () => {
    long.current = false;
    timer.current = window.setTimeout(() => { long.current = true; setOpen(true); navigator.vibrate?.(10); }, 450);
  };
  const endPress = () => window.clearTimeout(timer.current);
  return (
    <>
      {open && <div className="fab-scrim" onClick={() => setOpen(false)} />}
      <div style={{ position: 'fixed', right: 20, bottom: 'calc(34px + env(safe-area-inset-bottom) * .5)', zIndex: 31 }}>
        {open && (
          <div className="fab-menu" role="menu" aria-label="Создать">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); ed.requestNew(); }}>
              <Icon name="plus" size={20} color="#3E423C" width={2} />Новая задача
            </button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); create.project(); }}>
              <Ring size={22} progress={0} />Новый проект
            </button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); create.area(); }}>
              <Icon name="area" size={20} color="#3E423C" />Новая область
            </button>
          </div>
        )}
        <button type="button" className="fab" style={{ position: 'static' }}
          aria-label="Новая задача (долгое нажатие — новый проект или область)"
          onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => { if (long.current) { long.current = false; return; } ed.requestNew(); }}>
          <Icon name="plus" size={26} color="#15171A" width={2.2} />
        </button>
      </div>
    </>
  );
}
