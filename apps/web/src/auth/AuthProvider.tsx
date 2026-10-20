import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPrefs, sanitize, setPrefs, usePrefs } from '../prefs/store';
import { ProgressStore, type SaveResult } from '../sync/queue';
import { makeAuthApi, type AuthApi, type Profile } from './api';
import { supabase, supabaseConfigured, usernameDomain } from './supabase';

export interface AuthCtx {
  status: 'loading' | 'guest' | 'signedIn';
  configured: boolean;
  user: User | null;
  profile: Profile | null;
  api: AuthApi | null;
  userKey: string;
  progress: ProgressStore;
  recovering: boolean;
  refreshProfile: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovering, setRecovering] = useState(false);
  const prefs = usePrefs();

  const api = useMemo(() => (supabase ? makeAuthApi(supabase, { usernameDomain, siteUrl: window.location.origin }) : null), []);
  const user = session?.user ?? null;
  const userKey = user?.id ?? 'guest';

  const progress = useMemo(() => {
    if (!supabase || !user) return new ProgressStore({ userKey: 'guest' });
    const client = supabase;
    return new ProgressStore({
      userKey: user.id,
      rpc: async (items) => {
        const { data, error } = await client.rpc('save_progress', { items });
        if (error) throw error;
        return data as unknown as SaveResult;
      },
      pull: async () => {
        const { data, error } = await client.from('progress').select('key, data, client_ts, rev, updated_at').eq('user_id', user.id).limit(5000);
        if (error) throw error;
        return (data ?? []) as never;
      },
    });
  }, [user]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') { setProfile(null); setRecovering(false); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!api || !user) return;
    try {
      let p = await api.getProfile(user.id);
      // Age band and language travel as sign-up metadata (the database trigger only reads name and username),
      // so they are applied on first sign-in.
      const meta = user.user_metadata as { age_band?: Profile['age_band']; locale?: Profile['locale'] } | undefined;
      if (p && (p.age_band === null && meta?.age_band || meta?.locale && p.locale !== meta.locale && !p.display_prefs?.touched)) {
        const patch: Partial<Profile> = {};
        if (p.age_band === null && meta?.age_band) patch.age_band = meta.age_band;
        if (meta?.locale && !p.display_prefs?.touched && p.locale !== meta.locale) patch.locale = meta.locale;
        await api.updateProfile(user.id, patch);
        p = { ...p, ...patch };
      }
      setProfile(p);
      if (p) setPrefs(sanitize({ ...getPrefs(), ...(p.display_prefs as object), locale: p.locale }));
    } catch { /* offline: keep whatever we had */ }
  }, [api, user]);

  useEffect(() => {
    if (!user) return;
    void refreshProfile();
    void (async () => { await progress.adopt('guest'); await progress.pullAndMerge(); await progress.flush(); })();
    const online = () => void progress.flush();
    window.addEventListener('online', online);
    return () => { window.removeEventListener('online', online); progress.dispose(); };
  }, [user, progress, refreshProfile]);

  // Keep the account's reading preferences in step with this device (debounced, and only when they actually differ).
  const last = useRef('');
  useEffect(() => {
    if (!api || !user || !profile) return;
    const { locale, ...display } = prefs;
    const sig = JSON.stringify({ locale, display });
    if (!last.current) { last.current = sig; return; }
    if (sig === last.current) return;
    const h = setTimeout(() => {
      last.current = sig;
      void api.updateProfile(user.id, { locale, display_prefs: { ...display, touched: true } }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(h);
  }, [prefs, api, user, profile]);

  const value: AuthCtx = {
    status: loading ? 'loading' : user ? 'signedIn' : 'guest',
    configured: supabaseConfigured, user, profile, api, userKey, progress, recovering, refreshProfile,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
