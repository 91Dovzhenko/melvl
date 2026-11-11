import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/session';
import { PREVIEW_DATA, useShellData, type ShellData } from './lib/data';
import { Login } from './screens/Login';
import { Section } from './screens/Section';
import { Sidebar } from './shell/Sidebar';
import { PhoneMenu } from './shell/PhoneMenu';
import { Icon } from './ui/icons';

function useIsPhone() {
  const q = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

// Локальный просмотр каркаса без входа: только в `npm run dev`, адрес …/melvl/?preview
const PREVIEW = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');

// Прямые ссылки на GitHub Pages: сборка кладёт 404.html = копия index.html, роутер разбирает путь сам.
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      {PREVIEW ? <Shell data={PREVIEW_DATA} email="demo@example.com" /> : <Gate />}
    </BrowserRouter>
  );
}

function Gate() {
  const s = useSession();
  if (s.status === 'loading') return <div className="login-page" aria-busy="true" />;
  if (s.status === 'out') return <Login />;
  return <SignedIn email={s.session.user.email ?? ''} />;
}

function SignedIn({ email }: { email: string }) {
  const data = useShellData(true);
  return (
    <>
      <Shell data={data} email={email} />
      {data.error && <div className="toast" role="status">Не удалось загрузить данные: {data.error}</div>}
    </>
  );
}

function Shell({ data, email }: { data: ShellData; email: string }) {
  const phone = useIsPhone();
  const sections = (
    <>
      <Route path="/inbox" element={<Section kind="inbox" data={data} phone={phone} />} />
      <Route path="/today" element={<Section kind="today" data={data} phone={phone} />} />
      <Route path="/plans" element={<Section kind="plans" data={data} phone={phone} />} />
      <Route path="/log" element={<Section kind="log" data={data} phone={phone} />} />
      <Route path="/project/:id" element={<Section kind="project" data={data} phone={phone} />} />
      <Route path="/area/:id" element={<Section kind="area" data={data} phone={phone} />} />
    </>
  );

  if (phone) {
    return (
      <Routes>
        <Route path="/" element={<div className="phone menu-bg"><PhoneMenu data={data} email={email} /></div>} />
        <Route path="*" element={<PhoneList>{<Routes>{sections}<Route path="*" element={<Navigate to="/" replace />} /></Routes>}</PhoneList>} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <Sidebar data={data} email={email} />
      <main className="panel">
        <div className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            {sections}
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
        <div className="toolbar">
          <button type="button" className="tool" aria-label="Новая задача" title="Новая задача  ⌘N — этап 1" disabled>
            <Icon name="plus" size={18} color="#3E423C" width={2} />
          </button>
          <button type="button" className="tool" aria-label="Когда" title="Когда — этап 1" disabled>
            <Icon name="when" size={18} color="#3E423C" />
          </button>
          <button type="button" className="tool" aria-label="Переместить" title="Переместить — этап 1" disabled>
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
      <button type="button" className="fab" aria-label="Новая задача — этап 1" disabled>
        <Icon name="plus" size={26} color="#15171A" width={2.2} />
      </button>
    </div>
  );
}
