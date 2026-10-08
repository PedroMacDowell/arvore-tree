/** Erro com status HTTP e mensagem exibível ao jogador. Lançado pelos services e tratado em server.js. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
