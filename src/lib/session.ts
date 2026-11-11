import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type SessionState = { status: 'loading' } | { status: 'out' } | { status: 'in'; session: Session };

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) { setState({ status: 'out' }); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setState(data.session ? { status: 'in', session: data.session } : { status: 'out' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'in', session } : { status: 'out' });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return state;
}

export async function signInWithGoogle(redirectTo: string) {
  if (!supabase) throw new Error('Supabase не настроен');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}
