const db = require('../db');
const HttpError = require('../http-error');
const cleanText = require('../clean-text');
const STAGE_DAYS = [0, 3, 5, 8, 11, 14], CARE_DAYS = 14, SOIL = { start: 60, max: 100, perWatering: 20, fertilizer: 60, fertilizeBelow: 40 };
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dateFormat.format(new Date());
const stageFor = days => STAGE_DAYS.findLastIndex(start => days >= start);
async function publicUser(id) {
  const user = await db.users().findOne({ id }, { projection: { _id: 0, password: 0, username_key: 0, referred_by: 0, referral_reward_count: 0, created_at: 0 } });
  if (!user) return null;
  const { last_growth_date, ...rest } = user;
  const isGrowing = Boolean(user.planted_at) && user.growth_days < CARE_DAYS;
  const nextStageDay = STAGE_DAYS[user.tree_stage + 1] ?? null;
  return { ...rest, pests: Boolean(user.pests), is_growing: isGrowing, can_water: isGrowing && (!last_growth_date || last_growth_date < today()), next_stage_day: nextStageDay, stage_progress: nextStageDay ? Math.round((user.growth_days - STAGE_DAYS[user.tree_stage]) / (nextStageDay - STAGE_DAYS[user.tree_stage]) * 100) : 100 };
}
async function plantSeed(userId) {
  const user = await db.users().findOne({ id: userId });
  const state = await publicUser(userId);
  if (state.is_growing) throw new HttpError(409, 'Complete o cuidado da árvore atual antes de plantar outra.');
  if (user.seeds < 1) throw new HttpError(409, 'A próxima semente chega quando sua árvore estiver completa.');
  const planted = await db.users().updateOne({ id: userId, seeds: { $gte: 1 }, $or: [{ planted_at: null }, { planted_at: { $exists: false } }, { growth_days: { $gte: CARE_DAYS } }] }, { $inc: { seeds: -1, tree_cycle: 1 }, $set: { planted_at: today(), growth_days: 0, last_growth_date: null, tree_stage: 0, soil: SOIL.start, pests: 0 } });
  if (!planted.modifiedCount) throw new HttpError(409, 'A árvore mudou em outra solicitação. Atualize a página e tente novamente.');
  return { user: await publicUser(userId), message: 'Semente plantada! Regue para iniciar seu primeiro dia de cuidado.' };
}
async function waterTree(userId) {
  const u = await db.users().findOne({ id: userId }); const s = await publicUser(userId);
  if (!u.planted_at) throw new HttpError(409, 'Plante uma semente primeiro.');
  if (!s.is_growing) throw new HttpError(409, 'Árvore completa. Plante uma nova semente.');
  if (!s.can_water) throw new HttpError(409, 'Você já regou hoje. Volte amanhã.');
  if (s.pests) throw new HttpError(409, 'Trate os insetos antes de regar. Consiga proteção nas missões.');
  if (s.soil < SOIL.perWatering) throw new HttpError(409, 'O solo precisa de fertilizante. Consiga uma dose nas missões.');
  const days = u.growth_days + 1, stage = stageFor(days), completed = days === CARE_DAYS, pests = !completed && days % 4 === 0;
  let updated;
  await db.transaction(async session => {
    updated = await db.users(session).findOneAndUpdate({ id: userId, last_growth_date: { $ne: today() }, pests: { $in: [0, false] }, soil: { $gte: SOIL.perWatering }, growth_days: u.growth_days }, { $inc: { growth_days: 1, soil: -SOIL.perWatering, ...(completed ? { seeds: 1 } : {}) }, $max: { highest_stage: stage }, $set: { last_growth_date: today(), tree_stage: stage, pests: pests ? 1 : 0 } }, { returnDocument: 'after' });
    if (!updated) throw new HttpError(409, 'A árvore mudou em outra solicitação. Atualize a página e tente novamente.');
    if (completed) await db.forest(session).updateOne({ user_id: userId, cycle: u.tree_cycle }, { $setOnInsert: { user_id: userId, cycle: u.tree_cycle, name: u.tree_name, planted_at: u.planted_at, completed_at: today() } }, { upsert: true });
  });
  let message = completed ? 'Árvore completa! Ela agora faz parte da sua floresta e uma nova semente está disponível.' : `Rega concluída! Dia ${days} de ${CARE_DAYS} de cuidado.`;
  if (!completed && stage > u.highest_stage) message += ' Sua árvore cresceu e liberou novas missões.';
  if (pests) message += ' Insetos apareceram: trate-os antes da próxima rega.';
  return { user: await publicUser(userId), watered: true, message };
}
async function careForTree(userId, item) {
  if (item !== 'fertilizer' && item !== 'protection') throw new HttpError(400, 'Cuidado inválido.');
  const u = await db.users().findOne({ id: userId }); const s = await publicUser(userId);
  if (!s.is_growing) throw new HttpError(409, 'Este cuidado é para uma árvore em crescimento.');
  if (item === 'fertilizer') {
    if (u.soil > SOIL.fertilizeBelow) throw new HttpError(409, 'O solo ainda está nutrido. Guarde seu fertilizante.');
    const r = await db.users().updateOne({ id: userId, fertilizer: { $gte: 1 }, soil: { $lte: SOIL.fertilizeBelow } }, { $inc: { fertilizer: -1 }, $set: { soil: Math.min(SOIL.max, u.soil + SOIL.fertilizer) } });
    if (!r.modifiedCount) throw new HttpError(409, 'Conclua uma missão para ganhar fertilizante.');
    return { user: await publicUser(userId), message: 'Solo nutrido!' };
  }
  if (!u.pests) throw new HttpError(409, 'Não há insetos para tratar agora.');
  const r = await db.users().updateOne({ id: userId, pests: 1, insect_protection: { $gte: 1 } }, { $inc: { insect_protection: -1 }, $set: { pests: 0 } });
  if (!r.modifiedCount) throw new HttpError(409, 'Conclua uma missão para ganhar proteção.');
  return { user: await publicUser(userId), message: 'Insetos tratados! Sua árvore está protegida.' };
}
async function renameTree(userId, name) { const clean = cleanText(name); if (!clean) throw new HttpError(400, 'Nome inválido.'); if (clean.length > 40) throw new HttpError(400, 'Nome muito longo (máx. 40 caracteres).'); await db.users().updateOne({ id: userId }, { $set: { tree_name: clean } }); return { user: await publicUser(userId), message: 'Nome da árvore atualizado!' }; }
async function listForest(userId) { return db.forest().find({ user_id: userId }, { projection: { _id: 0, cycle: 1, name: 1, planted_at: 1, completed_at: 1 } }).sort({ cycle: -1 }).toArray(); }
module.exports = { publicUser, plantSeed, waterTree, careForTree, renameTree, listForest };
