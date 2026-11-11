import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// Только публичный anon key. Доступ к строкам ограничен RLS (owner = auth.uid()).
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Адрес, куда Google вернёт после входа: корень приложения (локально и на Pages). */
export const appRootUrl = () => window.location.origin + import.meta.env.BASE_URL;
