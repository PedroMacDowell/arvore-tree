const HttpError = require('../http-error');

/**
 * Limita requisições por chave (IP, e-mail…) numa janela fixa de tempo. Fica em memória, o que basta
 * para uma única instância — o SQLite em arquivo já exige isso.
 *
 * `failuresOnly`: só contam as respostas com erro (ex.: login com senha errada). A tentativa é contada
 * ao chegar e devolvida se der certo; assim várias tentativas simultâneas não furam o limite.
 */
function rateLimit({ windowMinutes, max, key = req => req.ip, failuresOnly = false, message }) {
  const windowMs = windowMinutes * 60 * 1000;
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    if (!k) return next();
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new HttpError(429, message);
    }
    entry.count++;
    if (failuresOnly) res.on('finish', () => { if (res.statusCode < 400) entry.count = Math.max(0, entry.count - 1); });
    next();
  };
}

const TOO_MANY_LOGINS = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
const emailOf = req => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '');

module.exports = {
  // Proteção geral contra excesso de requisições (com folga para uma sala de aula no mesmo IP).
  api: rateLimit({ windowMinutes: 1, max: 1000, message: 'Muitas requisições. Aguarde um instante.' }),
  // Força bruta de senha: por IP e por conta (protege também contra ataques vindos de muitos IPs).
  loginByIp: rateLimit({ windowMinutes: 15, max: 30, failuresOnly: true, message: TOO_MANY_LOGINS }),
  loginByEmail: rateLimit({ windowMinutes: 15, max: 10, failuresOnly: true, key: emailOf, message: TOO_MANY_LOGINS }),
  // Criação de contas em massa (ex.: para farmar bônus de indicação).
  register: rateLimit({ windowMinutes: 60, max: 60, message: 'Muitos cadastros a partir desta rede. Tente novamente mais tarde.' }),
  // Rotas que enviam e-mail (cadastro, reenvio, esqueci a senha): um único limite por endereço,
  // para ninguém lotar a caixa de outra pessoa, e outro por IP.
  emailsToAddress: rateLimit({ windowMinutes: 60, max: 5, key: emailOf, message: 'Muitos e-mails pedidos para este endereço. Aguarde uma hora e tente de novo.' }),
  emailsByIp: rateLimit({ windowMinutes: 60, max: 100, message: 'Muitos pedidos a partir desta rede. Tente novamente mais tarde.' }),
  // Links de confirmação e de nova senha: tentativas com links inválidos.
  linksByIp: rateLimit({ windowMinutes: 15, max: 30, failuresOnly: true, message: 'Muitas tentativas com links inválidos. Aguarde alguns minutos.' }),
};
