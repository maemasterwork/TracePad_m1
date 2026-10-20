import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '../prefs/store';

export type AgeBand = 'under13' | '13_15' | '16_17' | 'adult';
export const AGE_BANDS: AgeBand[] = ['under13', '13_15', '16_17', 'adult'];
export type Role = 'student' | 'teacher' | 'platform_admin' | 'content_editor';

export interface Profile {
  id: string; full_name: string; username: string | null; role: Role; locale: Locale; age_band: AgeBand | null;
  display_prefs: Record<string, unknown>;
}

export const MIN_PASSWORD = 10;
const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignUpInput {
  mode: 'email' | 'username';
  email: string; username: string; password: string; fullName: string; ageBand: AgeBand | ''; locale: Locale;
}
export type FieldErrors = Partial<Record<'email' | 'username' | 'password' | 'fullName' | 'ageBand', string>>;

/** Returns i18n keys for every problem (empty object when the form is fine). The server checks again; this is for speed. */
export function validateSignUp(v: SignUpInput): FieldErrors {
  const e: FieldErrors = {};
  if (!v.fullName.trim()) e.fullName = 'auth.errName';
  if (v.mode === 'email') {
    if (!v.email.trim()) e.email = 'auth.errRequired';
    else if (!EMAIL_RE.test(v.email.trim())) e.email = 'auth.errEmail';
  } else if (!USERNAME_RE.test(v.username.trim())) e.username = 'auth.errUsernameBad';
  if (v.password.length < MIN_PASSWORD) e.password = 'auth.errWeak';
  if (!v.ageBand) e.ageBand = 'auth.errAge';
  else if (v.ageBand === 'under13') e.ageBand = 'auth.under13';
  return e;
}

export const usernameToEmail = (username: string, domain: string) => `${username.trim().toLowerCase()}@${domain}`;
export const identifierToEmail = (id: string, domain: string) => (id.includes('@') ? id.trim() : usernameToEmail(id, domain));

/** Maps any error from the account server to a translation key. Never shows raw server text to a learner. */
export function mapAuthError(err: unknown): string {
  const e = err as { message?: string; status?: number; code?: string; name?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'auth.errOffline';
  // GoTrue hides the sign-up trigger's reason behind this text and answers 500, which supabase-js reports as a retryable fetch error.
  if (msg.includes('database error saving new user')) return 'auth.errUsernameTaken';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed') || e?.name === 'AuthRetryableFetchError') return 'auth.errOffline';
  if (msg.includes('rate limit') || e?.status === 429 || e?.code === 'over_request_rate_limit' || e?.code === 'over_email_send_rate_limit') return 'auth.errRate';
  if (e?.code === 'user_already_exists' || msg.includes('already registered')) return 'auth.errExists';
  if (msg.includes('username taken')) return 'auth.errUsernameTaken';
  if (msg.includes('invalid username')) return 'auth.errUsernameBad';
  if (msg.includes('invalid login') || e?.code === 'invalid_credentials') return 'auth.errInvalid';
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('at least') || e?.code === 'weak_password')) return 'auth.errWeak';
  return 'auth.errGeneric';
}

export class AuthError extends Error {
  constructor(public key: string, cause?: unknown) { super(key); this.cause = cause; }
}
function fail(err: unknown): never { throw new AuthError(mapAuthError(err), err); }

export function makeAuthApi(client: SupabaseClient, opts: { usernameDomain: string; siteUrl: string }) {
  const redirect = (path: string) => opts.siteUrl.replace(/\/$/, '') + path;
  return {
    async signUp(v: SignUpInput): Promise<{ needsConfirmation: boolean }> {
      const errs = validateSignUp(v);
      if (Object.keys(errs).length) throw new AuthError(Object.values(errs)[0]!);
      const email = v.mode === 'email' ? v.email.trim() : usernameToEmail(v.username, opts.usernameDomain);
      const { data, error } = await client.auth.signUp({
        email, password: v.password,
        options: { emailRedirectTo: redirect('/'), data: { full_name: v.fullName.trim(), username: v.mode === 'username' ? v.username.trim() : undefined, age_band: v.ageBand, locale: v.locale } },
      });
      if (error) fail(error);
      return { needsConfirmation: !data.session };
    },
    async signIn(identifier: string, password: string): Promise<void> {
      const { error } = await client.auth.signInWithPassword({ email: identifierToEmail(identifier, opts.usernameDomain), password });
      if (error) fail(error);
    },
    async sendMagicLink(email: string): Promise<void> {
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect('/'), shouldCreateUser: false } });
      if (error) fail(error);
    },
    async sendReset(email: string): Promise<void> {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect('/auth/update-password') });
      // Never reveal whether the address has an account: only transport and rate-limit problems are shown.
      if (error && ['auth.errOffline', 'auth.errRate'].includes(mapAuthError(error))) fail(error);
    },
    async updatePassword(password: string): Promise<void> {
      if (password.length < MIN_PASSWORD) throw new AuthError('auth.errWeak');
      const { error } = await client.auth.updateUser({ password });
      if (error) fail(error);
    },
    async changeEmail(email: string): Promise<void> {
      if (!EMAIL_RE.test(email.trim())) throw new AuthError('auth.errEmail');
      const { error } = await client.auth.updateUser({ email: email.trim() }, { emailRedirectTo: redirect('/account') });
      if (error) fail(error);
    },
    async oauth(provider: 'google' | 'azure'): Promise<void> {
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: redirect('/'), scopes: provider === 'azure' ? 'email' : undefined } });
      if (error) fail(error);
    },
    async signOut(): Promise<void> { await client.auth.signOut(); },
    async signOutOthers(): Promise<void> {
      const { error } = await client.auth.signOut({ scope: 'others' });
      if (error) fail(error);
    },

    async getProfile(userId: string): Promise<Profile | null> {
      const { data, error } = await client.from('profiles').select('id, full_name, username, role, locale, age_band, display_prefs').eq('id', userId).maybeSingle();
      if (error) fail(error);
      return (data as Profile | null) ?? null;
    },
    async updateProfile(userId: string, patch: Partial<Pick<Profile, 'full_name' | 'locale' | 'age_band' | 'display_prefs'>>): Promise<void> {
      const { error } = await client.from('profiles').update(patch).eq('id', userId);
      if (error) fail(error);
    },
    async claimTeacher(code: string): Promise<boolean> {
      const { data, error } = await client.rpc('claim_teacher', { p_code: code.trim() });
      if (error) fail(error);
      return data === true;
    },
    async exportData(): Promise<unknown> {
      const { data, error } = await client.rpc('export_my_data');
      if (error) fail(error);
      return data;
    },
    async deleteAccount(): Promise<void> {
      const { error } = await client.rpc('delete_my_account');
      if (error) {
        if ((error.message ?? '').toLowerCase().includes('cannot be deleted') || (error.message ?? '').toLowerCase().includes('manual')) throw new AuthError('profile.deleteRefused', error);
        fail(error);
      }
      await client.auth.signOut();
    },

    async mfaFactors(): Promise<{ id: string; status: string }[]> {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) fail(error);
      return (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status }));
    },
    async mfaEnroll(): Promise<{ id: string; qr: string; secret: string }> {
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' });
      if (error) fail(error);
      return { id: data!.id, qr: data!.totp.qr_code, secret: data!.totp.secret };
    },
    async mfaVerify(factorId: string, code: string): Promise<void> {
      const ch = await client.auth.mfa.challenge({ factorId });
      if (ch.error) fail(ch.error);
      const v = await client.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() });
      if (v.error) throw new AuthError('profile.mfaBad', v.error);
    },
    async mfaRemove(factorId: string): Promise<void> {
      const { error } = await client.auth.mfa.unenroll({ factorId });
      if (error) fail(error);
    },
  };
}
export type AuthApi = ReturnType<typeof makeAuthApi>;
