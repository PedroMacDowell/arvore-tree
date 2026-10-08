// Toda a configuração vem de variáveis de ambiente (backend/.env em desenvolvimento; painel da Vercel em produção).
// Em produção o app não sobe se faltar algo essencial: melhor falhar no deploy do que rodar quebrado.
const path = require('node:path');

const env = process.env;
const production = env.NODE_ENV === 'production';
const onVercel = Boolean(env.VERCEL);
const isLocalHost = host => ['localhost', '127.0.0.1', '::1'].includes(host);

function fail(message) {
  throw new Error(`Configuração inválida: ${message} Veja backend/.env.example.`);
}

// Banco: Turso (libsql://…) em produção; arquivo SQLite local em desenvolvimento e nos testes.
// A integração Turso da Vercel cria TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.
const database = {
  url: env.DATABASE_URL || env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'arvore.db')}`,
  authToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined,
};
database.isFile = database.url.startsWith('file:');

const trustProxy = Number(env.TRUST_PROXY ?? (production ? 1 : 0));
if (!Number.isInteger(trustProxy) || trustProxy < 0) fail('TRUST_PROXY deve ser um número inteiro ≥ 0.');

// Endereço público do site, usado nos links dos e-mails. Nunca é deduzido do cabeçalho Host da
// requisição, que um atacante controla. Na Vercel, sem APP_URL, usa o domínio de produção do projeto
// (ou o endereço da própria prévia, em deploys de prévia).
const vercelHost = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
const appUrl = (env.APP_URL || (vercelHost ? `https://${vercelHost}` : production ? '' : 'http://localhost:5173')).replace(/\/+$/, '');

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
  const missing = [['SMTP_HOST', env.SMTP_HOST], ['MAIL_FROM', env.MAIL_FROM], ['APP_URL', appUrl]].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) fail(`defina ${missing.join(', ')} no ambiente de produção.`);
  let url;
  try {
    url = new URL(appUrl);
  } catch {
    fail('APP_URL não é uma URL válida.');
  }
  if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) fail('APP_URL deve usar https:// em produção.');
  // Funções da Vercel não têm disco permanente: um banco em arquivo seria apagado.
  if (onVercel && database.isFile) fail('na Vercel o banco precisa ser remoto: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.');
}

module.exports = {
  production,
  port: Number(env.PORT || 3001),
  database,
  trustProxy,
  appUrl,
  mail, // null = e-mails só aparecem no terminal (desenvolvimento)
};
