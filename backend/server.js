const fs = require('node:fs');
const path = require('node:path');

// Carrega backend/.env antes de tudo: config.js lê as variáveis ao ser importado.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

let config;
try {
  config = require('./config');
} catch (err) {
  console.error(`✘ ${err.message}`); // configuração errada: mensagem clara no log do deploy, sem stack trace
  process.exit(1);
}

const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./db');
const HttpError = require('./http-error');
const { securityHeaders, sameOriginOnly, noStore } = require('./middleware/security');
const limits = require('./middleware/rate-limit');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
// Atrás do proxy da hospedagem (Render, Railway, Fly…), o IP real do usuário vem em X-Forwarded-For.
app.set('trust proxy', config.trustProxy);

app.use(securityHeaders);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api', noStore, limits.api, sameOriginOnly, routes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Em produção o mesmo servidor entrega o frontend compilado (npm run build).
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // Erros 4xx do próprio Express (JSON malformado, corpo grande demais…): resposta genérica, sem detalhes internos.
  if (err.expose && err.status < 500) {
    return res.status(err.status).json({ error: err.status === 413 ? 'Requisição grande demais.' : 'Requisição inválida.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

const server = app.listen(config.port, () => {
  console.log(`🌳 Árvore da Amazônia em http://localhost:${config.port}`);
  if (!config.production) console.log('   Modo desenvolvimento: cookies sem Secure. No deploy use NODE_ENV=production.');
  if (!config.mail) console.log('   SMTP não configurado: os e-mails aparecem aqui no terminal.');
});

// Desligamento limpo (o provedor envia SIGTERM a cada novo deploy): termina as requisições e fecha o banco.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
