// Servidor Node para desenvolvimento (npm run dev) e para hospedagens com servidor próprio (npm start).
// Na Vercel quem roda é vercel.js (serviço "backend"); este arquivo não é usado lá.
const fs = require('node:fs');
const path = require('node:path');

// Carrega backend/.env antes de tudo: config.js lê as variáveis ao ser importado.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

let config;
try {
  config = require('./config');
} catch (err) {
  console.error(`✘ ${err.message}`); // configuração errada: mensagem clara no log, sem stack trace
  process.exit(1);
}

const express = require('express');
const app = require('./app');
const db = require('./db');

// Entrega também o frontend compilado (npm run build). Na Vercel, isso é papel da CDN.
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

db.ready.catch(err => {
  console.error(`✘ Banco de dados: ${err.message}`);
  process.exit(1);
});

const server = app.listen(config.port, () => {
  console.log(`🌳 Árvore da Amazônia em http://localhost:${config.port}`);
  if (!config.production) console.log('   Modo desenvolvimento: cookies sem Secure. No deploy use NODE_ENV=production.');
  if (!config.mail) console.log('   SMTP não configurado: os e-mails aparecem aqui no terminal.');
});

// Desligamento limpo (a hospedagem envia SIGTERM a cada novo deploy): termina as requisições e fecha o banco.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
