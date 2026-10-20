// TEST-ONLY stand-in for the Supabase HTTP API (GoTrue + PostgREST subset). It is NOT a substitute for Supabase:
// it exists so the real supabase-js client, the app's API layer and the real migrations (with real row-level security)
// can be exercised together in CI where Docker and the Supabase images are unavailable.
// Not implemented: MFA, OAuth, e-mail delivery (messages go to GET /__test/outbox), realtime, storage.
// Usage (inside supabase/tests/scratch_db.sh, which exports PGHOST/PGPORT/PGUSER/PGDATABASE): node server.mjs [port]
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import { sign, verify, ANON_KEY } from './anon.mjs';

const PORT = Number(process.argv[2] ?? process.env.STANDIN_PORT ?? 54321);
const AUTOCONFIRM = process.env.STANDIN_CONFIRM !== '1';
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, database: process.env.PGDATABASE, max: 8 });

const users = new Map(); // email -> { id, email, password, meta, created }
const sessions = new Map(); // sid -> userId
const refresh = new Map(); // refresh token -> sid
const codes = new Map(); // pkce code -> userId
let outbox = [];

const ID = /^[a-z_][a-z0-9_]*$/;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' };
const send = (res, status, body, extra = {}) => {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json', ...extra });
  res.end(status === 204 ? undefined : data);
};
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });

const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created, phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.meta, identities: [{ identity_id: u.id, id: u.id, user_id: u.id, provider: 'email' }], created_at: u.created, updated_at: u.created });
function sessionFor(u, sid = crypto.randomUUID()) {
  sessions.set(sid, u.id);
  const rt = crypto.randomBytes(12).toString('hex');
  refresh.set(rt, sid);
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, session_id: sid, iat: now, exp: now + 3600, user_metadata: u.meta, app_metadata: { provider: 'email' } });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: rt, user: userJson(u) };
}
const bearer = (req) => verify((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
const gtErr = (res, status, error_code, msg) => send(res, status, { code: status, error_code, msg });

async function userExists(id) {
  const r = await pool.query('select 1 from auth.users where id = $1', [id]);
  return r.rowCount > 0;
}

// ---------------------------------------------------------------- GoTrue subset
async function auth(req, res, url, body) {
  const path = url.pathname.replace('/auth/v1', '');
  if (path === '/settings') return send(res, 200, { external: { email: true, google: true, azure: true }, disable_signup: false, mailer_autoconfirm: AUTOCONFIRM });
  if (path === '/signup' && req.method === 'POST') {
    const email = String(body.email ?? '').toLowerCase();
    if (!email.includes('@')) return gtErr(res, 422, 'validation_failed', 'Unable to validate email address: invalid format');
    if (String(body.password ?? '').length < 6) return gtErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
    if (users.has(email)) return gtErr(res, 422, 'user_already_exists', 'User already registered');
    const id = crypto.randomUUID();
    const meta = body.data ?? {};
    try {
      await pool.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(meta)]);
    } catch {
      // Real GoTrue hides the trigger's message behind a generic one; the app maps it to "username taken".
      return gtErr(res, 500, 'unexpected_failure', 'Database error saving new user');
    }
    const u = { id, email, password: body.password, meta, created: new Date().toISOString() };
    users.set(email, u);
    if (!AUTOCONFIRM) { outbox.push({ type: 'confirm', to: email }); return send(res, 200, userJson(u)); }
    return send(res, 200, sessionFor(u));
  }
  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = users.get(String(body.email ?? '').toLowerCase());
      if (!u || u.password !== body.password || !(await userExists(u.id))) return gtErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, sessionFor(u));
    }
    if (grant === 'refresh_token') {
      const sid = refresh.get(body.refresh_token);
      const uid = sid && sessions.get(sid);
      const u = uid && [...users.values()].find((x) => x.id === uid);
      if (!u) return gtErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refresh.delete(body.refresh_token);
      return send(res, 200, sessionFor(u, sid));
    }
    if (grant === 'pkce') {
      const uid = codes.get(body.auth_code);
      const u = uid && [...users.values()].find((x) => x.id === uid);
      if (!u) return gtErr(res, 400, 'flow_state_not_found', 'invalid flow state, no valid flow state found');
      codes.delete(body.auth_code);
      return send(res, 200, sessionFor(u));
    }
    return gtErr(res, 400, 'unsupported_grant_type', 'unsupported grant type');
  }
  if (path === '/user') {
    const claims = bearer(req);
    if (!claims?.sub || !(await userExists(claims.sub))) return gtErr(res, 401, 'bad_jwt', 'invalid claim: missing sub claim');
    const u = [...users.values()].find((x) => x.id === claims.sub);
    if (!u) return gtErr(res, 401, 'user_not_found', 'User from sub claim in JWT does not exist');
    if (req.method === 'GET') return send(res, 200, userJson(u));
    if (req.method === 'PUT') {
      if (body.password) { if (String(body.password).length < 6) return gtErr(res, 422, 'weak_password', 'Password should be at least 6 characters.'); u.password = body.password; }
      if (body.email) { outbox.push({ type: 'email_change', to: body.email }); return send(res, 200, { ...userJson(u), new_email: body.email }); }
      return send(res, 200, userJson(u));
    }
  }
  if (path === '/logout' && req.method === 'POST') {
    const claims = bearer(req);
    const scope = url.searchParams.get('scope') ?? 'global';
    if (claims?.sub) {
      for (const [sid, uid] of [...sessions]) {
        if (uid !== claims.sub) continue;
        if (scope === 'others' ? sid !== claims.session_id : scope === 'local' ? sid === claims.session_id : true) sessions.delete(sid);
      }
    }
    return send(res, 204);
  }
  if (path === '/recover' && req.method === 'POST') {
    const u = users.get(String(body.email ?? '').toLowerCase());
    if (u) { const code = crypto.randomBytes(8).toString('hex'); codes.set(code, u.id); outbox.push({ type: 'recovery', to: u.email, code }); }
    return send(res, 200, {});
  }
  if (path === '/otp' && req.method === 'POST') {
    const u = users.get(String(body.email ?? '').toLowerCase());
    if (u) { const code = crypto.randomBytes(8).toString('hex'); codes.set(code, u.id); outbox.push({ type: 'magiclink', to: u.email, code }); }
    return send(res, 200, {});
  }
  return gtErr(res, 501, 'not_implemented', `stand-in does not implement ${req.method} ${path}`);
}

// ---------------------------------------------------------------- PostgREST subset
const procCache = new Map();
async function isSet(client, fn) {
  if (!procCache.has(fn)) {
    const r = await client.query("select proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1", [fn]);
    procCache.set(fn, r.rows[0]?.proretset ?? null);
  }
  return procCache.get(fn);
}
function filters(url, startIdx) {
  const where = [], params = [];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    if (!ID.test(k)) throw Object.assign(new Error('bad filter column'), { status: 400, code: 'PGRST100' });
    const m = /^(eq|neq|gt|gte|lt|lte|like|in)\.(.*)$/.exec(v);
    if (!m) throw Object.assign(new Error('unsupported filter'), { status: 400, code: 'PGRST100' });
    const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like' };
    if (m[1] === 'in') { const list = m[2].replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')); params.push(list); where.push(`${k}::text = any($${startIdx + params.length - 1})`); }
    else { params.push(m[2]); where.push(`${k}::text ${ops[m[1]]} $${startIdx + params.length - 1}`); }
  }
  return { where: where.length ? ' where ' + where.join(' and ') : '', params };
}
async function rest(req, res, url, body) {
  const claims = bearer(req);
  const authed = claims?.role === 'authenticated' && claims.sub && (await userExists(claims.sub));
  if (!claims) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid', details: null, hint: null });
  const role = authed ? 'authenticated' : 'anon';
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authed ? claims.sub : '']);
    const path = url.pathname.replace('/rest/v1/', '');
    let out;
    if (path.startsWith('rpc/')) {
      const fn = path.slice(4);
      if (!ID.test(fn)) throw Object.assign(new Error('bad function name'), { status: 404, code: 'PGRST202' });
      const set = await isSet(client, fn);
      if (set === null) throw Object.assign(new Error(`Could not find the function public.${fn} in the schema cache`), { status: 404, code: 'PGRST202' });
      const keys = Object.keys(body ?? {}).filter((k) => ID.test(k));
      const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const vals = keys.map((k) => (typeof body[k] === 'object' && body[k] !== null ? JSON.stringify(body[k]) : body[k]));
      const r = set ? await client.query(`select * from public.${fn}(${args})`, vals) : await client.query(`select public.${fn}(${args}) as result`, vals);
      out = set ? r.rows : r.rows[0].result;
    } else {
      const table = path;
      if (!ID.test(table)) throw Object.assign(new Error('bad table'), { status: 404, code: 'PGRST205' });
      if (req.method === 'GET') {
        const sel = (url.searchParams.get('select') ?? '*').split(',').map((s) => s.trim());
        if (!sel.every((s) => s === '*' || ID.test(s))) throw Object.assign(new Error('unsupported select'), { status: 400, code: 'PGRST100' });
        const f = filters(url, 1);
        const order = url.searchParams.get('order');
        const ord = order && /^[a-z_][a-z0-9_]*(\.(asc|desc))?$/.test(order) ? ` order by ${order.split('.')[0]} ${order.split('.')[1] ?? 'asc'}` : '';
        const lim = Number(url.searchParams.get('limit'));
        const r = await client.query(`select ${sel.join(', ')} from public.${table}${f.where}${ord}${lim > 0 ? ` limit ${Math.min(lim, 10000)}` : ''}`, f.params);
        out = r.rows;
        if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
          if (out.length !== 1) { await client.query('rollback'); return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.length} rows`, hint: null }); }
          out = out[0];
        }
      } else if (req.method === 'PATCH') {
        const cols = Object.keys(body).filter((k) => ID.test(k));
        const sets = cols.map((k, i) => `${k} = $${i + 1}${typeof body[k] === 'object' && body[k] !== null ? '::jsonb' : ''}`);
        const vals = cols.map((k) => (typeof body[k] === 'object' && body[k] !== null ? JSON.stringify(body[k]) : body[k]));
        const f = filters(url, cols.length + 1);
        const r = await client.query(`update public.${table} set ${sets.join(', ')}${f.where} returning *`, [...vals, ...f.params]);
        out = (req.headers.prefer ?? '').includes('return=representation') ? r.rows : undefined;
      } else throw Object.assign(new Error('stand-in supports GET and PATCH on tables'), { status: 405, code: 'PGRST117' });
    }
    await client.query('commit');
    return out === undefined ? send(res, 204) : send(res, 200, out);
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    const status = e.status ?? (e.code === '42501' ? (authed ? 403 : 401) : e.code === '23505' ? 409 : e.code === 'P0001' || e.code === '22023' || e.code === '23514' ? 400 : 400);
    return send(res, status, { code: e.code ?? 'PGRST000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- test control
async function control(req, res, url, body) {
  if (url.pathname === '/__test/outbox') return send(res, 200, outbox);
  if (url.pathname === '/__test/reset') {
    await pool.query('truncate auth.users cascade');
    users.clear(); sessions.clear(); refresh.clear(); codes.clear(); outbox = [];
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/__test/sql') {
    try { const r = await pool.query(body.sql, body.params ?? []); return send(res, 200, r.rows); } catch (e) { return send(res, 400, { message: e.message }); }
  }
  if (url.pathname === '/__test/anon') return send(res, 200, { key: ANON_KEY });
  return send(res, 404, { message: 'no such control endpoint' });
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
  try {
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url, body);
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url, body);
    if (url.pathname.startsWith('/__test/')) return await control(req, res, url, body);
    return send(res, 404, { message: 'not found' });
  } catch (e) {
    return send(res, 500, { message: String(e.message ?? e) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`standin supabase listening on 127.0.0.1:${PORT} (autoconfirm=${AUTOCONFIRM})`));
