// Função da Vercel: todas as requisições /api/* chegam aqui (ver vercel.json) e são tratadas pelo app Express.
let app;
try {
  app = require('../backend/app');
} catch (err) {
  // Configuração inválida (ex.: variável de ambiente faltando): mensagem clara no log da Vercel.
  console.error(`✘ ${err.message}`);
  app = (_req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Servidor em manutenção. Tente novamente em alguns minutos.' }));
  };
}

module.exports = app;
