const db = require('../db');
const HttpError = require('../http-error');
const { production } = require('../config');
const { newToken, hashToken } = require('../tokens');
const SESSION_DAYS = 7;
const COOKIE = production ? '__Host-session' : 'session';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
async function startSession(res, userId) {
  await db.sessions().deleteMany({ expires_at: { $lte: new Date() } });
  const { token, hash } = newToken();
  await db.sessions().insertOne({ token_hash: hash, user_id: userId, expires_at: new Date(Date.now() + SESSION_DAYS * 86400_000) });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 86400_000 });
}
async function endSession(req, res) { const token = req.cookies[COOKIE]; if (typeof token === 'string') await db.sessions().deleteOne({ token_hash: hashToken(token) }); res.clearCookie(COOKIE, cookieOptions); }
async function requireAuth(req, _res, next) {
  const token = req.cookies[COOKIE]; const session = typeof token === 'string' && await db.sessions().findOne({ token_hash: hashToken(token), expires_at: { $gt: new Date() } });
  if (!session) throw new HttpError(401, 'Sessão expirada. Faça login novamente.'); req.userId = session.user_id; next();
}
module.exports = { startSession, endSession, requireAuth };
