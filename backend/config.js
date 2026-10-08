// Toda a configuração vem de variáveis de ambiente (backend/.env em desenvolvimento).
// Em produção o servidor não sobe se faltar algo essencial: melhor falhar no deploy do que rodar quebrado.
const path = require('node:path');

const env = process.env;
const production = env.NODE_ENV === 'production';
const isLocalHost = host => ['localhost', '127.0.0.1', '::1'].includes(host);

function fail(message) {
  throw new Error(`Configuração inválida: ${message} Veja backend/.env.example.`);
}

const trustProxy = Number(env.TRUST_PROXY ?? (production ? 1 : 0));
if (!Number.isInteger(trustProxy) || trustProxy < 0) fail('TRUST_PROXY deve ser um número inteiro ≥ 0.');

// Endereço público do site, usado nos links dos e-mails. Nunca é deduzido do cabeçalho Host
// da requisição, que um atacante controla (os links de senha apontariam para o site dele).
const appUrl = (env.APP_URL || (production ? '' : 'http://localhost:5173')).replace(/\/+$/, '');

let mail = null;
if (env.SMTP_HOST) {
  const port = Number(env.SMTP_PORT || 587);
  mail = {
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS direto; nas demais portas o STARTTLS é obrigatório
    requireTLS: port !== 465 && !isLocalHost(env.SMTP_HOST), // servidores locais de teste (Mailpit) não usam TLS
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    from: env.MAIL_FROM || 'Árvore da Amazônia <nao-responda@localhost>',
  };
}

if (production) {
  const missing = ['APP_URL', 'SMTP_HOST', 'MAIL_FROM'].filter(name => !env[name]);
  if (missing.length) fail(`defina ${missing.join(', ')} no ambiente de produção.`);
  let url;
  try {
    url = new URL(appUrl);
  } catch {
    fail('APP_URL não é uma URL válida.');
  }
  if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) fail('APP_URL deve usar https:// em produção.');
}

module.exports = {
  production,
  port: Number(env.PORT || 3001),
  dbPath: env.DB_PATH || path.join(__dirname, 'arvore.db'),
  trustProxy,
  appUrl,
  mail, // null = e-mails só aparecem no terminal (desenvolvimento)
};
