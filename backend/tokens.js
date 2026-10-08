const { createHash, randomBytes } = require('node:crypto');

/**
 * Tokens secretos (sessão, confirmação de e-mail, redefinição de senha): 256 bits aleatórios.
 * Só o hash SHA-256 vai para o banco; o token em si fica apenas com o usuário (cookie ou link).
 */
const hashToken = token => createHash('sha256').update(token).digest('base64url');

function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

module.exports = { newToken, hashToken };
