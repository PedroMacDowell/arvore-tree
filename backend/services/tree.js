const db = require('../db');
const HttpError = require('../http-error');
const cleanText = require('../clean-text');

/** Dia de cuidado em que começa cada estágio: Semente, Broto, Muda, Jovem, Madura, Ancestral. */
const STAGE_DAYS = [0, 3, 5, 8, 11, 14];
const CARE_DAYS = STAGE_DAYS.at(-1);
const PESTS_EVERY = 4; // insetos aparecem a cada 4 dias de cuidado
const SOIL = { start: 60, max: 100, perWatering: 20, fertilizer: 60, fertilizeBelow: 40 };

// A rega é liberada uma vez por dia no calendário de São Paulo.
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dateFormat.format(new Date());

const stageFor = days => STAGE_DAYS.findLastIndex(start => days >= start);

/** Estado do jogador enviado ao frontend. */
function publicUser(id) {
  const user = db.prepare(`
    SELECT id, username, email, referral_code, seeds, coins, fertilizer, insect_protection,
           tree_name, tree_cycle, planted_at, growth_days, last_growth_date, tree_stage, highest_stage, soil, pests
    FROM users WHERE id = ?
  `).get(id);
  if (!user) return null;

  const { last_growth_date, ...rest } = user;
  const isGrowing = Boolean(user.planted_at) && user.growth_days < CARE_DAYS;
  const stageStart = STAGE_DAYS[user.tree_stage];
  const nextStageDay = STAGE_DAYS[user.tree_stage + 1] ?? null;
  return {
    ...rest,
    pests: Boolean(user.pests),
    is_growing: isGrowing,
    can_water: isGrowing && (!last_growth_date || last_growth_date < today()),
    next_stage_day: nextStageDay,
    stage_progress: nextStageDay ? Math.round((user.growth_days - stageStart) / (nextStageDay - stageStart) * 100) : 100,
  };
}

const plantSeed = db.transaction(userId => {
  const user = publicUser(userId);
  if (user.is_growing) throw new HttpError(409, 'Complete o cuidado da árvore atual antes de plantar outra.');
  if (user.seeds < 1) throw new HttpError(409, 'A próxima semente chega quando sua árvore estiver completa.');

  db.prepare(`
    UPDATE users SET seeds = seeds - 1, tree_cycle = tree_cycle + 1, planted_at = ?, growth_days = 0,
                     last_growth_date = NULL, tree_stage = 0, soil = ?, pests = 0
    WHERE id = ?
  `).run(today(), SOIL.start, userId);
  return { user: publicUser(userId), message: 'Semente plantada! Regue para iniciar seu primeiro dia de cuidado.' };
});

const waterTree = db.transaction(userId => {
  const user = publicUser(userId);
  if (!user.planted_at) throw new HttpError(409, 'Plante uma semente primeiro.');
  if (!user.is_growing) throw new HttpError(409, 'Árvore completa. Plante uma nova semente.');
  if (!user.can_water) throw new HttpError(409, 'Você já regou hoje. Volte amanhã.');
  if (user.pests) throw new HttpError(409, 'Trate os insetos antes de regar. Consiga proteção nas missões.');
  if (user.soil < SOIL.perWatering) throw new HttpError(409, 'O solo precisa de fertilizante. Consiga uma dose nas missões.');

  const days = user.growth_days + 1;
  const stage = stageFor(days);
  const completed = days === CARE_DAYS;
  const pests = !completed && days % PESTS_EVERY === 0;
  db.prepare(`
    UPDATE users SET growth_days = ?, last_growth_date = ?, tree_stage = ?, highest_stage = MAX(highest_stage, ?),
                     soil = soil - ?, pests = ?
    WHERE id = ?
  `).run(days, today(), stage, stage, SOIL.perWatering, pests ? 1 : 0, userId);

  if (completed) {
    db.prepare('INSERT INTO forest_trees (user_id, cycle, name, planted_at, completed_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, user.tree_cycle, user.tree_name, user.planted_at, today());
    db.prepare('UPDATE users SET seeds = seeds + 1 WHERE id = ?').run(userId);
    return { user: publicUser(userId), watered: true, message: 'Árvore completa! Ela agora faz parte da sua floresta e uma nova semente está disponível.' };
  }

  let message = `Rega concluída! Dia ${days} de ${CARE_DAYS} de cuidado.`;
  if (stage > user.highest_stage) message += ' Sua árvore cresceu e liberou novas missões.';
  if (pests) message += ' Insetos apareceram: trate-os antes da próxima rega.';
  return { user: publicUser(userId), watered: true, message };
});

const careForTree = db.transaction((userId, item) => {
  const user = publicUser(userId);
  if (!user.is_growing) throw new HttpError(409, 'Este cuidado é para uma árvore em crescimento.');

  if (item === 'fertilizer') {
    if (user.soil > SOIL.fertilizeBelow) throw new HttpError(409, 'O solo ainda está nutrido. Guarde seu fertilizante.');
    if (user.fertilizer < 1) throw new HttpError(409, 'Conclua uma missão para ganhar fertilizante.');
    db.prepare('UPDATE users SET fertilizer = fertilizer - 1, soil = MIN(?, soil + ?) WHERE id = ?').run(SOIL.max, SOIL.fertilizer, userId);
    return { user: publicUser(userId), message: 'Solo nutrido!' };
  }
  if (item === 'protection') {
    if (!user.pests) throw new HttpError(409, 'Não há insetos para tratar agora.');
    if (user.insect_protection < 1) throw new HttpError(409, 'Conclua uma missão para ganhar proteção.');
    db.prepare('UPDATE users SET insect_protection = insect_protection - 1, pests = 0 WHERE id = ?').run(userId);
    return { user: publicUser(userId), message: 'Insetos tratados! Sua árvore está protegida.' };
  }
  throw new HttpError(400, 'Cuidado inválido.');
});

function renameTree(userId, name) {
  const clean = cleanText(name);
  if (!clean) throw new HttpError(400, 'Nome inválido.');
  if (clean.length > 40) throw new HttpError(400, 'Nome muito longo (máx. 40 caracteres).');
  db.prepare('UPDATE users SET tree_name = ? WHERE id = ?').run(clean, userId);
  return { user: publicUser(userId), message: 'Nome da árvore atualizado!' };
}

function listForest(userId) {
  return db.prepare('SELECT cycle, name, planted_at, completed_at FROM forest_trees WHERE user_id = ? ORDER BY cycle DESC').all(userId);
}

module.exports = { publicUser, plantSeed, waterTree, careForTree, renameTree, listForest };
