import { useState } from 'react';
import { appRootUrl, isConfigured } from '../lib/supabase';
import { signInWithGoogle } from '../lib/session';

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(appRootUrl());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось войти');
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <main className="login-card">
        <div className="login-brand">
          <span className="login-mark"><span /></span>
          <h1>ME:LVL</h1>
          <p>Задачи на день и рост навыков</p>
        </div>
        <button type="button" className="btn-dark" onClick={go} disabled={busy || !isConfigured}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 12h8" stroke="#C5F25A" strokeWidth={2} strokeLinecap="round" />
          </svg>
          Войти через Google
        </button>
        {!isConfigured && (
          <div className="login-error">Нет ключей Supabase: заполните .env.local по образцу .env.example.</div>
        )}
        {error && <div className="login-error" role="alert">{error}</div>}
      </main>
    </div>
  );
}
