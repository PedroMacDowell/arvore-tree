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
function startSession(res, userId) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  const { token, hash } = newToken();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").run(hash, userId, `+${SESSION_DAYS} days`);
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

function endSession(req, res) {
  const token = req.cookies[COOKIE];
  if (typeof token === 'string') db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  res.clearCookie(COOKIE, cookieOptions);
}

/** Exige sessão válida e expõe o id do jogador em req.userId. */
function requireAuth(req, _res, next) {
  const token = req.cookies[COOKIE];
  const userId = typeof token === 'string'
    && db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')").pluck().get(hashToken(token));
  if (!userId) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  req.userId = userId;
  next();
}

module.exports = { startSession, endSession, requireAuth };
