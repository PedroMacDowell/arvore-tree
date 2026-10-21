const db = require('../db'); const HttpError = require('../http-error'); const LEVELS = require('../catalog/missions'); const { publicUser } = require('./tree');
const SUPPLIES = { fertilizer_reward: 1, protection_reward: 1 }, MISSIONS = new Map();
for (const level of LEVELS) for (const mission of level.missions) { if (MISSIONS.has(mission.key)) throw new Error(`Missão duplicada: ${mission.key}`); MISSIONS.set(mission.key, { ...mission, ...SUPPLIES, stage: level.stage }); }
async function listMissions(userId) {
  const user = await db.users().findOne({ id: userId }, { projection: { highest_stage: 1 } }); const done = new Set((await db.missions().find({ user_id: userId }).toArray()).map(x => x.mission_key));
  return LEVELS.map(level => ({ stage: level.stage, theme: level.theme, unlocked: level.stage <= user.highest_stage, total: level.missions.length, completed: level.missions.filter(m => done.has(m.key)).length, missions: level.stage <= user.highest_stage ? level.missions.map(m => ({ ...MISSIONS.get(m.key), completed: done.has(m.key) })) : [] }));
}
async function completeMission(userId, key) {
  const m = MISSIONS.get(key); if (!m) throw new HttpError(404, 'Missão não encontrada.');
  try {
    await db.transaction(async session => {
      const user = await db.users(session).findOne({ id: userId });
      if (m.stage > user.highest_stage) throw new HttpError(403, 'Cuide da sua árvore para liberar este nível de missões.');
      await db.missions(session).insertOne({ user_id: userId, mission_key: key, completed_at: new Date() });
      await db.users(session).updateOne({ id: userId }, { $inc: { coins: m.coin_reward, fertilizer: 1, insect_protection: 1 } });
    });
  } catch (e) { if (e.code === 11000) throw new HttpError(409, 'Missão já concluída.'); throw e; }
  return { user: await publicUser(userId), message: `Missão concluída! +${m.coin_reward} moedas, +1 fertilizante e +1 proteção.` };
}
module.exports = { listMissions, completeMission };
