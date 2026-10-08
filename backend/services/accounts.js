const bcrypt = require('bcryptjs');
const { randomInt, randomUUID } = require('node:crypto');
const db = require('../db');
const HttpError = require('../http-error');
const cleanText = require('../clean-text');
const background = require('../background');
const { appUrl } = require('../config');
const { newToken, hashToken } = require('../tokens');
const mailer = require('./mailer');

const BCRYPT_COST = 11;
const STARTING_COINS = 10;
// Quem entra com um código ganha moedas extras; quem indicou também, até um limite de amigos.
const REFERRAL_BONUS = { newUser: 10, referrer: 25, maxRewardedFriends: 10 };
const CONFIRMATION_HOURS = 24;
const RESET_MINUTES = 60;

// Hash bcrypt (custo 11) de um texto aleatório já descartado. O login compara com ele quando o e-mail
// não existe, para levar o mesmo tempo com ou sem conta e não revelar quais e-mails estão cadastrados.
const DUMMY_HASH = '$2b$11$SY4L8KKBUHKy0lTW4x.sv.WI6JVsqWNFkLWVouPWSuCOtKbBlkzDK';

const normalizeEmail = email => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const emailExists = async email => Boolean(await db.get('SELECT 1 FROM users WHERE email = ?', email));

function validateEmail(email) {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'A senha deve ter no mínimo 6 caracteres.');
  // O bcrypt só considera os primeiros 72 bytes; senhas maiores seriam cortadas sem aviso.
  if (Buffer.byteLength(password) > 72) throw new HttpError(400, 'A senha deve ter no máximo 72 caracteres.');
}

async function uniqueReferralCode(username, q) {
  const prefix = username.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'AMZ';
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `${prefix}-${randomInt(1000, 10000)}`;
    if (!(await q.get('SELECT 1 FROM users WHERE referral_code = ?', code))) return code;
  }
  throw new Error('Não foi possível gerar um código de indicação único.');
}

/**
 * Cadastro em duas etapas: guarda os dados como pendentes e envia o link de confirmação.
 * Se o e-mail já tem conta, o dono recebe um aviso. A resposta é a mesma nos dois casos, e as
 * gravações e o e-mail acontecem depois dela: nem o conteúdo nem o tempo revelam quais e-mails existem.
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
  if (await db.get('SELECT 1 FROM users WHERE username = ?', username)) throw new HttpError(409, 'Nome de guardião já em uso. Escolha outro.');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const alreadyRegistered = await emailExists(email);
  const code = typeof referralCode === 'string' ? referralCode.trim().toUpperCase() : '';

  background(async () => {
    if (alreadyRegistered) return mailer.sendAlreadyRegistered(email);
    const referrerId = code ? await db.value('SELECT id FROM users WHERE referral_code = ?', code) : null;
    const { token, hash } = newToken();
    await db.run("DELETE FROM pending_registrations WHERE expires_at <= datetime('now')");
    // Um novo cadastro com o mesmo e-mail substitui o anterior; só quem abre o link no e-mail ativa a conta.
    await db.run(`
      INSERT INTO pending_registrations (email, username, password, referred_by, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', ?))
      ON CONFLICT (email) DO UPDATE SET username = excluded.username, password = excluded.password,
        referred_by = excluded.referred_by, token_hash = excluded.token_hash, expires_at = excluded.expires_at
    `, email, username, passwordHash, referrerId ?? null, hash, `+${CONFIRMATION_HOURS} hours`);
    await mailer.sendEmailConfirmation(email, username, `${appUrl}/confirmar-email#token=${token}`);
  });
}

/** Gera um novo link para um cadastro ainda não confirmado. Não diz se havia cadastro. */
function resendConfirmation(email) {
  email = normalizeEmail(email);
  validateEmail(email);
  background(async () => {
    const username = await db.value("SELECT username FROM pending_registrations WHERE email = ? AND expires_at > datetime('now')", email);
    if (!username) return;
    const { token, hash } = newToken();
    await db.run("UPDATE pending_registrations SET token_hash = ?, expires_at = datetime('now', ?) WHERE email = ?", hash, `+${CONFIRMATION_HOURS} hours`, email);
    await mailer.sendEmailConfirmation(email, username, `${appUrl}/confirmar-email#token=${token}`);
  });
}

/** Abre o link de confirmação: cria a conta de verdade e devolve o id do usuário. */
function confirmEmail(token) {
  if (typeof token !== 'string' || !token) throw new HttpError(400, 'Link inválido ou expirado. Faça o cadastro novamente.');
  return db.transaction(async tx => {
    const pending = await tx.get("SELECT * FROM pending_registrations WHERE token_hash = ? AND expires_at > datetime('now')", hashToken(token));
    if (!pending) throw new HttpError(400, 'Link inválido ou expirado. Faça o cadastro novamente.');
    if (await tx.get('SELECT 1 FROM users WHERE email = ?', pending.email)) throw new HttpError(409, 'Este e-mail já tem uma conta. Faça login.');
    if (await tx.get('SELECT 1 FROM users WHERE username = ?', pending.username)) {
      throw new HttpError(409, `O nome "${pending.username}" foi escolhido por outra pessoa. Cadastre-se de novo com outro nome.`);
    }

    await tx.run('DELETE FROM pending_registrations WHERE email = ?', pending.email);
    const referrerId = pending.referred_by;
    const id = randomUUID();
    await tx.run('INSERT INTO users (id, username, email, password, referral_code, referred_by, coins) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, pending.username, pending.email, pending.password, await uniqueReferralCode(pending.username, tx), referrerId,
      STARTING_COINS + (referrerId ? REFERRAL_BONUS.newUser : 0));
    if (referrerId) {
      // Conta o próprio novo usuário: o bônus vale para os primeiros amigos de cada código.
      const friends = await tx.value('SELECT COUNT(*) FROM users WHERE referred_by = ?', referrerId);
      if (friends <= REFERRAL_BONUS.maxRewardedFriends) await tx.run('UPDATE users SET coins = coins + ? WHERE id = ?', REFERRAL_BONUS.referrer, referrerId);
    }
    return id;
  });
}

/** Confere as credenciais e devolve o id do usuário. */
async function login({ email, password }) {
  email = normalizeEmail(email);
  if (!email || typeof password !== 'string' || !password) throw new HttpError(400, 'Informe e-mail e senha.');

  const user = await db.get('SELECT id, password FROM users WHERE email = ?', email);
  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'E-mail ou senha incorretos.');

  // Se o custo do bcrypt aumentar no futuro, a senha é re-hasheada no próximo login.
  if (bcrypt.getRounds(user.password) < BCRYPT_COST) {
    await db.run('UPDATE users SET password = ? WHERE id = ?', await bcrypt.hash(password, BCRYPT_COST), user.id);
  }
  return user.id;
}

/** "Esqueci minha senha": envia um link de uso único. Não diz (nem no tempo de resposta) se o e-mail tem conta. */
function requestPasswordReset(email) {
  email = normalizeEmail(email);
  validateEmail(email);
  background(async () => {
    const userId = await db.value('SELECT id FROM users WHERE email = ?', email);
    if (!userId) return;
    const { token, hash } = newToken();
    await db.transaction(async tx => {
      // Só o link mais recente vale.
      await tx.run("DELETE FROM password_resets WHERE user_id = ? OR expires_at <= datetime('now')", userId);
      await tx.run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))", hash, userId, `+${RESET_MINUTES} minutes`);
    });
    await mailer.sendPasswordReset(email, `${appUrl}/redefinir-senha#token=${token}`);
  });
}

/** Troca a senha pelo link recebido, encerra todas as sessões abertas e devolve o id do usuário. */
async function resetPassword({ token, password }) {
  validatePassword(password); // antes de gastar o link, para um erro de digitação não invalidá-lo
  if (typeof token !== 'string' || !token) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha".');
  // Gasta o link numa única operação atômica: entre envios simultâneos, só um recebe o usuário de volta.
  const used = await db.get("DELETE FROM password_resets WHERE token_hash = ? AND expires_at > datetime('now') RETURNING user_id", hashToken(token));
  if (!used) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha".');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const email = await db.transaction(async tx => {
    await tx.run('UPDATE users SET password = ? WHERE id = ?', passwordHash, used.user_id);
    await tx.run('DELETE FROM sessions WHERE user_id = ?', used.user_id);
    await tx.run('DELETE FROM password_resets WHERE user_id = ?', used.user_id);
    return tx.value('SELECT email FROM users WHERE id = ?', used.user_id);
  });
  background(() => mailer.sendPasswordChanged(email));
  return used.user_id;
}

module.exports = { register, resendConfirmation, confirmEmail, login, requestPasswordReset, resetPassword };
