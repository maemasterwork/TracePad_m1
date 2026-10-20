import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthError, identifierToEmail, makeAuthApi, mapAuthError, validateSignUp, type SignUpInput } from '../src/auth/api';

const base: SignUpInput = { mode: 'email', email: 'a@b.co', username: '', password: 'correct horse battery', fullName: 'Ada', ageBand: 'adult', locale: 'en' };

describe('validateSignUp', () => {
  it('accepts a good email sign-up', () => expect(validateSignUp(base)).toEqual({}));
  it('requires name, valid email, 10+ char password and an age group', () => {
    const e = validateSignUp({ ...base, fullName: ' ', email: 'nope', password: 'short', ageBand: '' });
    expect(e).toEqual({ fullName: 'auth.errName', email: 'auth.errEmail', password: 'auth.errWeak', ageBand: 'auth.errAge' });
  });
  it('username mode validates the username, not the email', () => {
    expect(validateSignUp({ ...base, mode: 'username', email: '', username: 'ab' }).username).toBe('auth.errUsernameBad');
    expect(validateSignUp({ ...base, mode: 'username', email: '', username: 'ali.rezaei_7' })).toEqual({});
    expect(validateSignUp({ ...base, mode: 'username', email: '', username: 'a b c' }).username).toBe('auth.errUsernameBad');
  });
  it('under-13 learners cannot self-register', () => expect(validateSignUp({ ...base, ageBand: 'under13' }).ageBand).toBe('auth.under13'));
});

describe('identifiers', () => {
  it('turns a username into the pseudo email and leaves real emails alone', () => {
    expect(identifierToEmail('Ali.R', 'students.tracepad.app')).toBe('ali.r@students.tracepad.app');
    expect(identifierToEmail(' x@y.org ', 'd')).toBe('x@y.org');
  });
});

describe('mapAuthError', () => {
  const cases: [unknown, string][] = [
    [{ message: 'Invalid login credentials', status: 400 }, 'auth.errInvalid'],
    [{ message: 'Database error saving new user: username taken' }, 'auth.errUsernameTaken'],
    [{ message: 'Database error saving new user', status: 500, name: 'AuthRetryableFetchError' }, 'auth.errUsernameTaken'],
    [{ message: 'User already registered', code: 'user_already_exists', status: 422 }, 'auth.errExists'],
    [{ message: 'invalid username' }, 'auth.errUsernameBad'],
    [{ message: 'x', status: 429 }, 'auth.errRate'],
    [{ message: 'rate limited' }, 'auth.errRate'],
    [{ message: 'Failed to fetch' }, 'auth.errOffline'],
    [{ message: 'Password should be at least 10 characters', code: 'weak_password' }, 'auth.errWeak'],
    [{ message: 'something unexpected: SELECT * FROM secrets' }, 'auth.errGeneric'],
  ];
  it.each(cases)('%j -> %s', (err, key) => expect(mapAuthError(err)).toBe(key));
  it('never leaks raw server text', () => expect(mapAuthError({ message: 'secret stack trace' })).toBe('auth.errGeneric'));
});

function fakeClient(over: Record<string, unknown> = {}) {
  const auth = {
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
  };
  return { client: { auth: { ...auth, ...(over.auth as object) }, rpc: vi.fn(async () => ({ data: true, error: null })) } as unknown as SupabaseClient, auth };
}

describe('auth api (against a stand-in client)', () => {
  const api = (c: SupabaseClient) => makeAuthApi(c, { usernameDomain: 'students.tracepad.app', siteUrl: 'https://app.example/' });
  it('sign-up sends name, username and age band as metadata and reports confirmation needed', async () => {
    const { client, auth } = fakeClient();
    const r = await api(client).signUp({ ...base, mode: 'username', email: '', username: 'Ali.R' });
    expect(r.needsConfirmation).toBe(true);
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'ali.r@students.tracepad.app', password: base.password, options: { emailRedirectTo: 'https://app.example/', data: { full_name: 'Ada', username: 'Ali.R', age_band: 'adult', locale: 'en' } } });
  });
  it('sign-up validates before calling the server', async () => {
    const { client, auth } = fakeClient();
    await expect(api(client).signUp({ ...base, password: 'x' })).rejects.toMatchObject({ key: 'auth.errWeak' });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('wrong password shows the friendly error', async () => {
    const { client } = fakeClient({ auth: { signInWithPassword: async () => ({ error: { message: 'Invalid login credentials', status: 400 } }) } });
    await expect(api(client).signIn('a@b.co', 'pw')).rejects.toBeInstanceOf(AuthError);
    await expect(api(client).signIn('a@b.co', 'pw')).rejects.toMatchObject({ key: 'auth.errInvalid' });
  });
  it('password reset never reveals whether the address exists', async () => {
    const { client } = fakeClient({ auth: { resetPasswordForEmail: async () => ({ error: { message: 'User not found', status: 400 } }) } });
    await expect(api(client).sendReset('ghost@x.org')).resolves.toBeUndefined();
  });
  it('password reset still reports a rate limit', async () => {
    const { client } = fakeClient({ auth: { resetPasswordForEmail: async () => ({ error: { message: 'x', status: 429 } }) } });
    await expect(api(client).sendReset('a@x.org')).rejects.toMatchObject({ key: 'auth.errRate' });
  });
  it('claimTeacher returns false for a wrong code', async () => {
    const { client } = fakeClient();
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: false, error: null });
    expect(await api(client).claimTeacher('nope')).toBe(false);
  });
  it('new password must be at least 10 characters', async () => {
    const { client, auth } = fakeClient();
    await expect(api(client).updatePassword('short')).rejects.toMatchObject({ key: 'auth.errWeak' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
