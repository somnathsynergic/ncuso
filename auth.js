// Minimal admin auth: credentials from env, stateless signed-cookie session (no extra deps).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { findUser } from './db.js';

const COOKIE = 'admin_session';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'); // random => sessions reset on restart

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Checks user_id / password against md_user (bcrypt hash in user_password).
// Returns the user ({ userId, name }) or null. `lookup` is injectable for tests.
// A dummy hash is compared when the user does not exist so response time does not reveal valid ids.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
export async function authenticate(userId, password, lookup = findUser) {
  const user = await lookup(userId);
  let ok = false;
  try {
    ok = await bcrypt.compare(password, user ? String(user.passwordHash ?? '') : DUMMY_HASH);
  } catch {
    ok = false; // stored value is not a valid bcrypt hash
  }
  return user && ok ? { userId: user.userId, name: user.name } : null;
}

export function startSession(res, adminId) {
  const payload = Buffer.from(JSON.stringify({ u: adminId, exp: Date.now() + MAX_AGE_MS })).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_MS / 1000}${secure}`);
}

export function endSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// Returns the admin id from a valid, unexpired session cookie, or null
export function getAdminId(req) {
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return s.exp > Date.now() && typeof s.u === 'string' && s.u ? s.u : null;
  } catch {
    return null;
  }
}

export const isAuthed = (req) => getAdminId(req) !== null;

// For API routes: 401 JSON instead of redirect
export function requireAdmin(req, res, next) {
  const id = getAdminId(req);
  if (!id) return res.status(401).json({ error: 'Not authenticated' });
  req.adminId = id;
  next();
}

// Simple in-memory login throttle: 5 failures per IP per 10 minutes
const fails = new Map();
export const loginBlocked = (ip) => (fails.get(ip)?.filter((t) => Date.now() - t < 600000).length ?? 0) >= 5;
export const recordFail = (ip) => fails.set(ip, [...(fails.get(ip) || []).filter((t) => Date.now() - t < 600000), Date.now()]);
export const clearFails = (ip) => fails.delete(ip);
