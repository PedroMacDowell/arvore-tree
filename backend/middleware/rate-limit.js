const db = require('../db');
const HttpError = require('../http-error');

// Conta mais uma tentativa na janela atual (ou abre uma nova janela) numa única operação atômica.
const HIT = `
  INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
    reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
  RETURNING count, reset_at
`;

/**
 * Limita tentativas por chave (IP, e-mail…) numa janela fixa de tempo.
 *
 * store 'db': contadores no banco, compartilhados por todas as instâncias da função (Vercel).
 * store 'memory': por instância e sem custo de banco; usado só na proteção geral contra excesso.
 *
 * failuresOnly: a tentativa conta ao chegar (assim várias simultâneas não furam o limite) e é
 * devolvida quando dá certo — a rota chama refundAttempts(req) antes de responder.
 */
function rateLimit({ name, windowMinutes, max, key = req => req.ip, failuresOnly = false, store = 'db', message }) {
  const windowMs = windowMinutes * 60 * 1000;
  const memory = new Map();
  if (store === 'memory') {
    setInterval(() => {
      const now = Date.now();
      for (const [k, entry] of memory) if (entry.resetAt <= now) memory.delete(k);
    }, windowMs).unref();
  }

  async function hit(k, now) {
    if (store === 'memory') {
      let entry = memory.get(k);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        memory.set(k, entry);
      }
      entry.count++;
      return entry;
    }
    if (Math.random() < 0.01) await db.run('DELETE FROM rate_limits WHERE reset_at <= ?', now); // limpeza ocasional
    const row = await db.get(HIT, k, now + windowMs, now, now);
    return { count: row.count, resetAt: row.reset_at };
  }

  async function refund(k, resetAt) {
    if (store === 'memory') {
      const entry = memory.get(k);
      if (entry?.resetAt === resetAt) entry.count = Math.max(0, entry.count - 1);
      return;
    }
    await db.run('UPDATE rate_limits SET count = MAX(0, count - 1) WHERE key = ? AND reset_at = ?', k, resetAt);
  }

  return async (req, res, next) => {
    const value = key(req);
    if (!value) return next();
    const k = `${name}:${value}`;
    const now = Date.now();
    const { count, resetAt } = await hit(k, now);
    if (count > max) {
      res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
      throw new HttpError(429, message);
    }
    if (failuresOnly) (req.attemptRefunds ??= []).push(() => refund(k, resetAt));
    next();
  };
}

/** Devolve as tentativas de uma requisição que deu certo (ex.: senha correta). */
async function refundAttempts(req) {
  for (const refund of req.attemptRefunds ?? []) await refund();
}

const TOO_MANY_LOGINS = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
const emailOf = req => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '');

module.exports = {
  refundAttempts,
  // Proteção geral contra excesso de requisições (com folga para uma sala de aula no mesmo IP).
  api: rateLimit({ name: 'api', store: 'memory', windowMinutes: 1, max: 1000, message: 'Muitas requisições. Aguarde um instante.' }),
  // Força bruta de senha: por IP e por conta (protege também contra ataques vindos de muitos IPs).
  loginByIp: rateLimit({ name: 'login-ip', windowMinutes: 15, max: 30, failuresOnly: true, message: TOO_MANY_LOGINS }),
  loginByEmail: rateLimit({ name: 'login-email', windowMinutes: 15, max: 10, failuresOnly: true, key: emailOf, message: TOO_MANY_LOGINS }),
  // Criação de contas em massa (ex.: para farmar bônus de indicação).
  register: rateLimit({ name: 'register-ip', windowMinutes: 60, max: 60, message: 'Muitos cadastros a partir desta rede. Tente novamente mais tarde.' }),
  // Rotas que enviam e-mail (cadastro, reenvio, esqueci a senha): um único limite por endereço,
  // para ninguém lotar a caixa de outra pessoa, e outro por IP.
  emailsToAddress: rateLimit({ name: 'emails-to', windowMinutes: 60, max: 5, key: emailOf, message: 'Muitos e-mails pedidos para este endereço. Aguarde uma hora e tente de novo.' }),
  emailsByIp: rateLimit({ name: 'emails-ip', windowMinutes: 60, max: 100, message: 'Muitos pedidos a partir desta rede. Tente novamente mais tarde.' }),
  // Links de confirmação e de nova senha: tentativas com links inválidos.
  linksByIp: rateLimit({ name: 'links-ip', windowMinutes: 15, max: 30, failuresOnly: true, message: 'Muitas tentativas com links inválidos. Aguarde alguns minutos.' }),
};
