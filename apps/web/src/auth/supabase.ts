import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when this build knows where its account server is. Without it the app runs in guest mode only. */
export const supabaseConfigured = Boolean(url && key);
export const usernameDomain = (import.meta.env.VITE_USERNAME_DOMAIN as string | undefined) ?? 'students.tracepad.app';
export const oauthProviders: ('google' | 'azure')[] = ((import.meta.env.VITE_OAUTH_PROVIDERS as string | undefined) ?? '')
  .split(',').map((s) => s.trim()).filter((s): s is 'google' | 'azure' => s === 'google' || s === 'azure');

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;
