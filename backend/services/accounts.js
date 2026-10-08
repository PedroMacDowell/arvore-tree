const bcrypt = require('bcryptjs');
const { randomInt, randomUUID } = require('node:crypto');
const db = require('../db');
const HttpError = require('../http-error');
const cleanText = require('../clean-text');
const { appUrl } = require('../config');
const { newToken, hashToken } = require('../tokens');
const mailer = require('./mailer');

const BCRYPT_COST = 11;
const STARTING_COINS = 10;
// Quem entra com um código ganha moedas extras; quem indicou também, até um limite de amigos.
const REFERRAL_BONUS = { newUser: 10, referrer: 25, maxRewardedFriends: 10 };
const CONFIRMATION_HOURS = 24;
const RESET_MINUTES = 60;

// Hash de referência para comparar quando o e-mail não existe: o login leva o mesmo tempo
// com ou sem conta, então a resposta não revela quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), BCRYPT_COST);

const normalizeEmail = email => (typeof email === 'string' ? email.trim().toLowerCase() : '');

function validateEmail(email) {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'A senha deve ter no mínimo 6 caracteres.');
  // O bcrypt só considera os primeiros 72 bytes; senhas maiores seriam cortadas sem aviso.
  if (Buffer.byteLength(password) > 72) throw new HttpError(400, 'A senha deve ter no máximo 72 caracteres.');
}

function uniqueReferralCode(username) {
  const prefix = username.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'AMZ';
  const taken = db.prepare('SELECT 1 FROM users WHERE referral_code = ?');
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `${prefix}-${randomInt(1000, 10000)}`;
    if (!taken.get(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de indicação único.');
}

const emailExists = email => Boolean(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email));

/**
 * Cadastro em duas etapas: guarda os dados como pendentes e envia o link de confirmação.
 * Se o e-mail já tem conta, o dono recebe um aviso. A resposta é a mesma nos dois casos,
 * então o cadastro não revela quais e-mails estão em uso.
 */
async function register({ username, email, password, referral_code: referralCode }) {
  username = cleanText(username);
  email = normalizeEmail(email);
  if (!username || !email || !password) throw new HttpError(400, 'Preencha todos os campos obrigatórios.');
  // Só alfabeto latino: impede nomes que imitam outros com letras de aparência igual (ex.: o "a" cirílico, U+0430).
  if (!/^[\p{Script=Latin}\p{N} ._-]{2,30}$/u.test(username)) {
    throw new HttpError(400, 'O nome de guardião deve ter de 2 a 30 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.');
  }
  validateEmail(email);
  validatePassword(password);
  // O nome de guardião é público (aparece no app), então dizer que já existe não expõe ninguém.
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Nome de guardião já em uso. Escolha outro.');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST); // sempre, para o tempo de resposta não variar
  if (emailExists(email)) {
    mailer.sendAlreadyRegistered(email);
    return;
  }

  const code = typeof referralCode === 'string' ? referralCode.trim().toUpperCase() : '';
  const referrerId = code ? db.prepare('SELECT id FROM users WHERE referral_code = ?').pluck().get(code) : null;
  const { token, hash } = newToken();
  db.prepare("DELETE FROM pending_registrations WHERE expires_at <= datetime('now')").run();
  // Um novo cadastro com o mesmo e-mail substitui o anterior; só quem abre o link no e-mail ativa a conta.
  db.prepare(`
    INSERT INTO pending_registrations (email, username, password, referred_by, token_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
    ON CONFLICT (email) DO UPDATE SET username = excluded.username, password = excluded.password,
      referred_by = excluded.referred_by, token_hash = excluded.token_hash, expires_at = excluded.expires_at
  `).run(email, username, passwordHash, referrerId ?? null, hash, `+${CONFIRMATION_HOURS} hours`);
  mailer.sendEmailConfirmation(email, username, `${appUrl}/confirmar-email#token=${token}`);
}

/** Gera um novo link para um cadastro ainda não confirmado. Não diz se havia cadastro. */
function resendConfirmation(email) {
  email = normalizeEmail(email);
  validateEmail(email);
  const username = db.prepare("SELECT username FROM pending_registrations WHERE email = ? AND expires_at > datetime('now')").pluck().get(email);
  if (!username) return;
  const { token, hash } = newToken();
  db.prepare("UPDATE pending_registrations SET token_hash = ?, expires_at = datetime('now', ?) WHERE email = ?").run(hash, `+${CONFIRMATION_HOURS} hours`, email);
  mailer.sendEmailConfirmation(email, username, `${appUrl}/confirmar-email#token=${token}`);
}

/** Abre o link de confirmação: cria a conta de verdade e devolve o id do usuário. */
const confirmEmail = db.transaction(token => {
  const pending = typeof token === 'string' && token
    && db.prepare("SELECT * FROM pending_registrations WHERE token_hash = ? AND expires_at > datetime('now')").get(hashToken(token));
  if (!pending) throw new HttpError(400, 'Link inválido ou expirado. Faça o cadastro novamente.');
  if (emailExists(pending.email)) throw new HttpError(409, 'Este e-mail já tem uma conta. Faça login.');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(pending.username)) {
    throw new HttpError(409, `O nome "${pending.username}" foi escolhido por outra pessoa. Cadastre-se de novo com outro nome.`);
  }

  db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(pending.email);
  const referrerId = pending.referred_by;
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, email, password, referral_code, referred_by, coins) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, pending.username, pending.email, pending.password, uniqueReferralCode(pending.username), referrerId,
      STARTING_COINS + (referrerId ? REFERRAL_BONUS.newUser : 0));
  if (referrerId) {
    // Conta o próprio novo usuário: o bônus vale para os primeiros amigos de cada código.
    const friends = db.prepare('SELECT COUNT(*) FROM users WHERE referred_by = ?').pluck().get(referrerId);
    if (friends <= REFERRAL_BONUS.maxRewardedFriends) {
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(REFERRAL_BONUS.referrer, referrerId);
    }
  }
  return id;
});

/** Confere as credenciais e devolve o id do usuário. */
async function login({ email, password }) {
  email = normalizeEmail(email);
  if (!email || typeof password !== 'string' || !password) throw new HttpError(400, 'Informe e-mail e senha.');

  const user = db.prepare('SELECT id, password FROM users WHERE email = ?').get(email);
  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'E-mail ou senha incorretos.');

  // Se o custo do bcrypt aumentar no futuro, a senha é re-hasheada no próximo login.
  if (bcrypt.getRounds(user.password) < BCRYPT_COST) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(await bcrypt.hash(password, BCRYPT_COST), user.id);
  }
  return user.id;
}

/** "Esqueci minha senha": envia um link de uso único. Não diz se o e-mail tem conta. */
function requestPasswordReset(email) {
  email = normalizeEmail(email);
  validateEmail(email);
  const userId = db.prepare('SELECT id FROM users WHERE email = ?').pluck().get(email);
  if (!userId) return;
  const { token, hash } = newToken();
  db.transaction(() => {
    // Só o link mais recente vale.
    db.prepare("DELETE FROM password_resets WHERE user_id = ? OR expires_at <= datetime('now')").run(userId);
    db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").run(hash, userId, `+${RESET_MINUTES} minutes`);
  })();
  mailer.sendPasswordReset(email, `${appUrl}/redefinir-senha#token=${token}`);
}

/** Troca a senha pelo link recebido, encerra todas as sessões abertas e devolve o id do usuário. */
async function resetPassword({ token, password }) {
  validatePassword(password); // antes de gastar o link, para um erro de digitação não invalidá-lo
  // O link é consumido antes do bcrypt (assíncrono): dois envios simultâneos não usam o mesmo link.
  const userId = typeof token === 'string' && token && db.transaction(() => {
    const id = db.prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > datetime('now')").pluck().get(hashToken(token));
    if (id) db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(id);
    return id;
  })();
  if (!userId) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha".');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  db.transaction(() => {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(passwordHash, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  })();
  mailer.sendPasswordChanged(db.prepare('SELECT email FROM users WHERE id = ?').pluck().get(userId));
  return userId;
}

module.exports = { register, resendConfirmation, confirmEmail, login, requestPasswordReset, resetPassword };
