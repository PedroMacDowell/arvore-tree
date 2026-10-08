const db = require('../db');
const HttpError = require('../http-error');
const { production } = require('../config');
const { newToken, hashToken } = require('../tokens');

const SESSION_DAYS = 7;
// O prefixo __Host- obriga o navegador a aceitar o cookie só com Secure, Path=/ e sem Domain
// (nenhum subdomínio consegue sobrescrevê-lo). Exige HTTPS, por isso só em produção.
const COOKIE = production ? '__Host-session' : 'session';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };

// O cookie leva o token; o banco guarda apenas o hash. Se o banco vazar, não dá para entrar em nenhuma conta.
async function startSession(res, userId) {
  await db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  const { token, hash } = newToken();
  await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))", hash, userId, `+${SESSION_DAYS} days`);
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

async function endSession(req, res) {
  const token = req.cookies[COOKIE];
  if (typeof token === 'string') await db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
  res.clearCookie(COOKIE, cookieOptions);
}

/** Exige sessão válida e expõe o id do jogador em req.userId. */
async function requireAuth(req, _res, next) {
  const token = req.cookies[COOKIE];
  const userId = typeof token === 'string'
    && await db.value("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')", hashToken(token));
  if (!userId) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  req.userId = userId;
  next();
}

module.exports = { startSession, endSession, requireAuth };
