// Ponto de entrada do serviço "backend" na Vercel (vercel.json → services.backend.entrypoint).
// Recebe as requisições /api/* com o caminho original. Localmente quem roda é server.js.
const express = require('express');

let app;
try {
  app = require('./app');
} catch (err) {
  // Configuração inválida (ex.: variável de ambiente faltando): mensagem clara no log da Vercel
  // e uma resposta JSON para o visitante, em vez de a função quebrar.
  console.error(`✘ ${err.message}`);
  app = express();
  app.use((_req, res) => res.status(500).json({ error: 'Servidor em manutenção. Tente novamente em alguns minutos.' }));
}

module.exports = app;
