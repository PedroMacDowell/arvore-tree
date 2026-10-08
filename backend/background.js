const { waitUntil } = require('@vercel/functions');

/**
 * Roda uma tarefa depois da resposta (gravações e e-mails que não podem atrasar nem diferenciar o tempo de
 * resposta). Na Vercel, waitUntil mantém a função viva até a tarefa terminar; num servidor Node comum a
 * tarefa simplesmente continua rodando.
 */
module.exports = function background(task) {
  waitUntil(Promise.resolve().then(task).catch(err => console.error('Tarefa em segundo plano falhou:', err.message)));
};
