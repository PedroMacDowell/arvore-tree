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

const highestStage = userId => db.prepare('SELECT highest_stage FROM users WHERE id = ?').pluck().get(userId);

/** Todos os níveis; só os liberados trazem as missões. */
function listMissions(userId) {
  const unlockedUpTo = highestStage(userId);
  const done = new Set(db.prepare('SELECT mission_key FROM mission_completions WHERE user_id = ?').pluck().all(userId));
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

const completeMission = db.transaction((userId, key) => {
  const mission = MISSIONS.get(key);
  if (!mission) throw new HttpError(404, 'Missão não encontrada.');
  if (mission.stage > highestStage(userId)) throw new HttpError(403, 'Cuide da sua árvore para liberar este nível de missões.');

  const { changes } = db.prepare('INSERT OR IGNORE INTO mission_completions (user_id, mission_key) VALUES (?, ?)').run(userId, key);
  if (!changes) throw new HttpError(409, 'Missão já concluída.');

  db.prepare('UPDATE users SET coins = coins + ?, fertilizer = fertilizer + ?, insect_protection = insect_protection + ? WHERE id = ?')
    .run(mission.coin_reward, mission.fertilizer_reward, mission.protection_reward, userId);
  return {
    user: publicUser(userId),
    message: `Missão concluída! +${mission.coin_reward} moedas, +${mission.fertilizer_reward} fertilizante e +${mission.protection_reward} proteção.`,
  };
});

module.exports = { listMissions, completeMission };
