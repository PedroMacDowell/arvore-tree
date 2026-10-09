// App Express da API. Usado pelo serviço "backend" na Vercel (vercel.js) e pelo servidor local (server.js).
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const HttpError = require('./http-error');
const { securityHeaders, sameOriginOnly, noStore } = require('./middleware/security');
const limits = require('./middleware/rate-limit');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
// Atrás do proxy da hospedagem (Vercel, Render…), o IP real do usuário vem em X-Forwarded-For.
app.set('trust proxy', config.trustProxy);

app.use(securityHeaders);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Antes da primeira consulta, garante que as tabelas existem (roda uma vez por instância).
app.use('/api', async (_req, _res, next) => {
  await db.ready;
  next();
});
app.use('/api', noStore, limits.api, sameOriginOnly, routes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // Erros 4xx do próprio Express (JSON malformado, corpo grande demais…): resposta genérica, sem detalhes internos.
  if (err.expose && err.status < 500) {
    return res.status(err.status).json({ error: err.status === 413 ? 'Requisição grande demais.' : 'Requisição inválida.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

module.exports = app;
