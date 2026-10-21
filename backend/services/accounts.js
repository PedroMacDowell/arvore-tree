const bcrypt = require('bcryptjs');
const { randomInt, randomUUID } = require('node:crypto');
const db = require('../db');
const HttpError = require('../http-error');
const cleanText = require('../clean-text');
const background = require('../background');
const { appUrl } = require('../config');
const { newToken, hashToken } = require('../tokens');
const mailer = require('./mailer');

const COST = 11, START_COINS = 10, BONUS = { newUser: 10, referrer: 25, max: 10 };
const normalize = v => typeof v === 'string' ? v.trim().toLowerCase() : '';
const validateEmail = e => { if (!e || e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Informe um e-mail válido.'); };
function validatePassword(p) { if (typeof p !== 'string' || p.length < 6 || Buffer.byteLength(p) > 72) throw new HttpError(400, 'A senha deve ter entre 6 e 72 caracteres.'); }
async function referralCode(username, session) {
  const prefix = username.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'AMZ';
  for (let i = 0; i < 20; i++) { const code = `${prefix}-${randomInt(1000, 10000)}`; if (!await db.users(session).findOne({ referral_code: code })) return code; }
  throw new Error('Não foi possível gerar um código de indicação único.');
}
async function register({ username, email, password, referral_code }) {
  username = cleanText(username); email = normalize(email);
  if (!username || !email || !password) throw new HttpError(400, 'Preencha todos os campos obrigatórios.');
  if (!/^[\p{Script=Latin}\p{N} ._-]{2,30}$/u.test(username)) throw new HttpError(400, 'O nome deve ter de 2 a 30 caracteres.');
  validateEmail(email); validatePassword(password);
  if (await db.users().findOne({ username_key: username.toLocaleLowerCase('pt-BR') })) throw new HttpError(409, 'Nome de guardião já em uso. Escolha outro.');
  const passwordHash = await bcrypt.hash(password, COST);
  const existing = await db.users().findOne({ email }, { projection: { _id: 1 } });
  const code = typeof referral_code === 'string' ? referral_code.trim().toUpperCase() : '';
  background(async () => {
    if (existing) return mailer.sendAlreadyRegistered(email);
    const referrer = code ? await db.users().findOne({ referral_code: code }, { projection: { _id: 1 } }) : null;
    const { token, hash } = newToken();
    await db.pending().deleteMany({ expires_at: { $lte: new Date() } });
    await db.pending().updateOne({ email }, { $set: { email, username, username_key: username.toLocaleLowerCase('pt-BR'), password: passwordHash, referred_by: referrer?._id ?? null, token_hash: hash, expires_at: new Date(Date.now() + 24 * 3600_000) } }, { upsert: true });
    await mailer.sendEmailConfirmation(email, username, `${appUrl}/confirmar-email#token=${token}`);
  });
}
function resendConfirmation(email) {
  email = normalize(email); validateEmail(email);
  background(async () => {
    const p = await db.pending().findOne({ email, expires_at: { $gt: new Date() } }); if (!p) return;
    const { token, hash } = newToken();
    await db.pending().updateOne({ _id: p._id }, { $set: { token_hash: hash, expires_at: new Date(Date.now() + 24 * 3600_000) } });
    await mailer.sendEmailConfirmation(email, p.username, `${appUrl}/confirmar-email#token=${token}`);
  });
}
async function confirmEmail(token) {
  if (typeof token !== 'string' || !token) throw new HttpError(400, 'Link inv\u00e1lido ou expirado. Fa\u00e7a o cadastro novamente.');
  return db.transaction(async session => {
    const pending = db.pending(session), users = db.users(session);
    const p = await pending.findOne({ token_hash: hashToken(token), expires_at: { $gt: new Date() } });
    if (!p) throw new HttpError(400, 'Link inv\u00e1lido ou expirado. Fa\u00e7a o cadastro novamente.');
    if (await users.findOne({ email: p.email })) throw new HttpError(409, 'Este e-mail j\u00e1 tem uma conta. Fa\u00e7a login.');
    if (await users.findOne({ username_key: p.username_key })) throw new HttpError(409, 'Este nome de guardi\u00e3o j\u00e1 est\u00e1 em uso. Cadastre-se novamente.');
    const id = randomUUID();
    const user = { _id: id, id, username: p.username, username_key: p.username_key, email: p.email, password: p.password, referral_code: await referralCode(p.username, session), referred_by: p.referred_by, referral_reward_count: 0, seeds: 1, coins: START_COINS + (p.referred_by ? BONUS.newUser : 0), fertilizer: 0, insect_protection: 0, tree_name: 'Suma\u00fama Sagrada', tree_cycle: 0, planted_at: null, growth_days: 0, last_growth_date: null, tree_stage: 0, highest_stage: 0, soil: 60, pests: 0, created_at: new Date() };
    try { await users.insertOne(user); } catch (err) { if (err.code === 11000) throw new HttpError(409, 'Este e-mail ou nome j\u00e1 est\u00e1 cadastrado.'); throw err; }
    await pending.deleteOne({ _id: p._id });
    if (p.referred_by) await users.updateOne({ id: p.referred_by, referral_reward_count: { $lt: BONUS.max } }, { $inc: { coins: BONUS.referrer, referral_reward_count: 1 } });
    return id;
  });
}
async function login({ email, password }) {
  email = normalize(email); if (!email || typeof password !== 'string' || !password) throw new HttpError(400, 'Informe e-mail e senha.');
  const user = await db.users().findOne({ email });
  const valid = await bcrypt.compare(password, user?.password ?? '$2b$11$SY4L8KKBUHKy0lTW4x.sv.WI6JVsqWNFkLWVouPWSuCOtKbBlkzDK');
  if (!user || !valid) throw new HttpError(401, 'E-mail ou senha incorretos.');
  if (bcrypt.getRounds(user.password) < COST) await db.users().updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(password, COST) } });
  return user.id;
}
function requestPasswordReset(email) {
  email = normalize(email); validateEmail(email);
  background(async () => {
    const user = await db.users().findOne({ email }); if (!user) return;
    const { token, hash } = newToken();
    await db.resets().deleteMany({ $or: [{ user_id: user.id }, { expires_at: { $lte: new Date() } }] });
    await db.resets().insertOne({ token_hash: hash, user_id: user.id, expires_at: new Date(Date.now() + 3600_000) });
    await mailer.sendPasswordReset(email, `${appUrl}/redefinir-senha#token=${token}`);
  });
}
async function resetPassword({ token, password }) {
  validatePassword(password);
  if (typeof token !== 'string' || !token) throw new HttpError(400, 'Link inv\u00e1lido ou expirado. Pe\u00e7a um novo em \"Esqueci minha senha\".');
  const passwordHash = await bcrypt.hash(password, COST);
  const userId = await db.transaction(async session => {
    const reset = await db.resets(session).findOneAndDelete({ token_hash: hashToken(token), expires_at: { $gt: new Date() } });
    if (!reset) throw new HttpError(400, 'Link inv\u00e1lido ou expirado. Pe\u00e7a um novo em \"Esqueci minha senha\".');
    const users = db.users(session), sessions = db.sessions(session), resets = db.resets(session);
    await users.updateOne({ id: reset.user_id }, { $set: { password: passwordHash } });
    await sessions.deleteMany({ user_id: reset.user_id });
    await resets.deleteMany({ user_id: reset.user_id });
    return reset.user_id;
  });
  const user = await db.users().findOne({ id: userId });
  background(() => mailer.sendPasswordChanged(user.email));
  return userId;
}module.exports = { register, resendConfirmation, confirmEmail, login, requestPasswordReset, resetPassword };
