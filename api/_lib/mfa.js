const crypto = require('crypto');
const { authenticator } = require('otplib');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

authenticator.options = { window: 1 }; 

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ISSUER = 'Udder Recruitment Dashboard';
const MFA_COOKIE = 'dash_mfa';
const MFA_TTL_SECONDS = 12 * 60 * 60; // re-ask for a code at least every 12 hours
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

async function getSessionUser(req) {
  const token = req.cookies && req.cookies.refreshToken;
  if (!token) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return null; 
  }

  const { data: session } = await supabase
    .from('tbldashboardsessions')
    .select('id, user_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!session) return null; // revoked
  if (String(session.user_id) !== String(decoded.userId)) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;

  const { data: user } = await supabase
    .from('tbldashboardorganisationusers')
    .select('id, email, role, organisation_id')
    .eq('id', decoded.userId)
    .eq('active', true)
    .maybeSingle();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organisationId: user.organisation_id,
    sessionKey: session.id,
  };
}

function key() {
  const k = Buffer.from(process.env.MFA_ENCRYPTION_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return k;
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(stored) {
  const [iv, tag, enc] = stored.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
const hmac = (s) => crypto.createHmac('sha256', process.env.MFA_COOKIE_SECRET).update(s).digest('base64url');

function setMfaCookie(res, user) {
  const exp = Math.floor(Date.now() / 1000) + MFA_TTL_SECONDS;
  const body = Buffer.from(JSON.stringify({ u: String(user.id), s: sha(user.sessionKey), e: exp })).toString('base64url');
  res.setHeader('Set-Cookie',
    `${MFA_COOKIE}=${body}.${hmac(body)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MFA_TTL_SECONDS}`);
}

function clearMfaCookie(res) {
  res.setHeader('Set-Cookie', `${MFA_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function hasValidMfaCookie(req, user) {
  const raw = req.cookies && req.cookies[MFA_COOKIE];
  if (!raw || !raw.includes('.')) return false;
  const [body, sig] = raw.split('.');
  const expected = hmac(body);
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.u === String(user.id) && p.s === sha(user.sessionKey) && p.e > Date.now() / 1000;
  } catch { return false; }
}

async function getMfaRow(userId) {
  const { data, error } = await supabase
    .from('tbldashboardmfa').select('*').eq('user_id', String(userId)).maybeSingle();
  if (error) throw error;
  return data;
}
async function updateMfaRow(userId, fields) {
  const { error } = await supabase.from('tbldashboardmfa').update(fields).eq('user_id', String(userId));
  if (error) throw error;
}

async function checkCode(row, secretEnc, code) {
  if (row.locked_until && new Date(row.locked_until) > new Date()) return { ok: false, reason: 'locked' };

  const secret = decrypt(secretEnc);
  const delta = /^\d{6}$/.test(String(code)) ? authenticator.checkDelta(String(code), secret) : null;
  const step = Math.floor(Date.now() / 30000) + (delta || 0);
  const reused = row.last_timestep != null && step <= Number(row.last_timestep);

  if (delta === null || reused) {
    const fails = (row.failed_attempts || 0) + 1;
    await updateMfaRow(row.user_id, {
      failed_attempts: fails >= MAX_FAILS ? 0 : fails,
      locked_until: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
    });
    return { ok: false, reason: fails >= MAX_FAILS ? 'locked' : 'invalid' };
  }

  await updateMfaRow(row.user_id, { failed_attempts: 0, locked_until: null, last_timestep: step });
  return { ok: true };
}

async function getStatus(req) {
  const user = await getSessionUser(req);
  if (!user) return { status: 'none' };
  const row = await getMfaRow(user.id);
  if (!row || !row.secret_enc) return { status: 'enroll', user, row };
  if (hasValidMfaCookie(req, user)) return { status: 'ok', user, row };
  return { status: 'challenge', user, row };
}

async function requireMfa(req, res) {
  const s = await getStatus(req);
  if (s.status !== 'ok') {
    res.status(401).json({ status: s.status });
    return null;
  }
  return s.user;
}

module.exports = {
  supabase, authenticator, ISSUER,
  getSessionUser, getStatus, requireMfa, getMfaRow, updateMfaRow, checkCode,
  encrypt, setMfaCookie, clearMfaCookie,
};