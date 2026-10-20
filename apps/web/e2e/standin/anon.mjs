import crypto from 'node:crypto';
export const SECRET = 'tracepad-standin-secret-not-for-production';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload);
  const s = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
  return `${h}.${p}.${s}`;
}
export function verify(token) {
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p || !s) return null;
  const want = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}
export const ANON_KEY = sign({ role: 'anon', iss: 'standin', iat: 1700000000, exp: 4102444800 });
