const db = require('../db'); const HttpError = require('../http-error');
function rateLimit({ name, windowMinutes, max, key = req => req.ip, failuresOnly = false, store = 'db', message }) {
  const windowMs = windowMinutes * 60000, memory = new Map();
  if (store === 'memory') setInterval(() => { const now = Date.now(); for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k); }, windowMs).unref();
  async function hit(k, now) {
    if (store === 'memory') { let v = memory.get(k); if (!v || v.resetAt <= now) { v = { count: 0, resetAt: now + windowMs }; memory.set(k, v); } v.count++; return v; }
    if (Math.random() < .01) await db.rateLimits().deleteMany({ reset_at: { $lte: now } });
    try {
      const v = await db.rateLimits().findOneAndUpdate({ key: k }, [{ $set: { key: k, count: { $cond: [{ $lte: ['$reset_at', now] }, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] }, reset_at: { $cond: [{ $lte: ['$reset_at', now] }, now + windowMs, '$reset_at'] } } }], { upsert: true, returnDocument: 'after' });
      return { count: v.count, resetAt: v.reset_at };
    } catch (e) { if (e.code === 11000) return hit(k, now); throw e; }
  }
  async function refund(k, resetAt) {
    if (store === 'memory') { const v = memory.get(k); if (v?.resetAt === resetAt) v.count = Math.max(0, v.count - 1); return; }
    await db.rateLimits().updateOne({ key: k, reset_at: resetAt, count: { $gt: 0 } }, { $inc: { count: -1 } });
  }
  return async (req, res, next) => {
    const value = key(req); if (!value) return next(); const k = `${name}:${value}`, now = Date.now(), { count, resetAt } = await hit(k, now);
    if (count > max) { res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000))); throw new HttpError(429, message); }
    if (failuresOnly) (req.attemptRefunds ??= []).push(() => refund(k, resetAt)); next();
  };
}
async function refundAttempts(req) { for (const fn of req.attemptRefunds ?? []) await fn(); }
const TOO_MANY = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
const emailOf = req => typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
module.exports = {
  refundAttempts,
  api: rateLimit({ name: 'api', store: 'memory', windowMinutes: 1, max: 1000, message: 'Muitas requisições. Aguarde um instante.' }),
  loginByIp: rateLimit({ name: 'login-ip', windowMinutes: 15, max: 30, failuresOnly: true, message: TOO_MANY }),
  loginByEmail: rateLimit({ name: 'login-email', windowMinutes: 15, max: 10, failuresOnly: true, key: emailOf, message: TOO_MANY }),
  register: rateLimit({ name: 'register-ip', windowMinutes: 60, max: 60, message: 'Muitos cadastros a partir desta rede. Tente novamente mais tarde.' }),
  emailsToAddress: rateLimit({ name: 'emails-to', windowMinutes: 60, max: 5, key: emailOf, message: 'Muitos e-mails pedidos para este endereço. Aguarde uma hora e tente de novo.' }),
  emailsByIp: rateLimit({ name: 'emails-ip', windowMinutes: 60, max: 100, message: 'Muitos pedidos a partir desta rede. Tente novamente mais tarde.' }),
  linksByIp: rateLimit({ name: 'links-ip', windowMinutes: 15, max: 30, failuresOnly: true, message: 'Muitas tentativas com links inválidos. Aguarde alguns minutos.' }),
};
