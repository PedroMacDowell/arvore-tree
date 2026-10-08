const db = require('../db');
const HttpError = require('../http-error');
const LEVELS = require('../catalog/missions');
const { publicUser } = require('./tree');

// Insumos que toda missão concede, além das moedas do catálogo.
const SUPPLIES = { fertilizer_reward: 1, protection_reward: 1 };

const MISSIONS = new Map();
for (const level of LEVELS) {
  for (const mission of level.missions) {
    if (MISSIONS.has(mission.key)) throw new Error(`Missão duplicada no catálogo: ${mission.key}`);
    MISSIONS.set(mission.key, { ...mission, ...SUPPLIES, stage: level.stage });
  }
}

const highestStage = (userId, q = db) => q.value('SELECT highest_stage FROM users WHERE id = ?', userId);

/** Todos os níveis; só os liberados trazem as missões. */
async function listMissions(userId) {
  const unlockedUpTo = await highestStage(userId);
  const done = new Set((await db.all('SELECT mission_key FROM mission_completions WHERE user_id = ?', userId)).map(row => row.mission_key));
  return LEVELS.map(level => {
    const unlocked = level.stage <= unlockedUpTo;
    return {
      stage: level.stage,
      theme: level.theme,
      unlocked,
      total: level.missions.length,
      completed: level.missions.filter(m => done.has(m.key)).length,
      missions: unlocked ? level.missions.map(m => ({ ...MISSIONS.get(m.key), completed: done.has(m.key) })) : [],
    };
  });
}

function completeMission(userId, key) {
  const mission = MISSIONS.get(key);
  if (!mission) throw new HttpError(404, 'Missão não encontrada.');
  return db.transaction(async tx => {
    if (mission.stage > await highestStage(userId, tx)) throw new HttpError(403, 'Cuide da sua árvore para liberar este nível de missões.');

    const inserted = await tx.run('INSERT OR IGNORE INTO mission_completions (user_id, mission_key) VALUES (?, ?)', userId, key);
    if (!inserted) throw new HttpError(409, 'Missão já concluída.');

    await tx.run('UPDATE users SET coins = coins + ?, fertilizer = fertilizer + ?, insect_protection = insect_protection + ? WHERE id = ?',
      mission.coin_reward, mission.fertilizer_reward, mission.protection_reward, userId);
    return {
      user: await publicUser(userId, tx),
      message: `Missão concluída! +${mission.coin_reward} moedas, +${mission.fertilizer_reward} fertilizante e +${mission.protection_reward} proteção.`,
    };
  });
}

module.exports = { listMissions, completeMission };
