const db = require('../db'); const HttpError = require('../http-error'); const REWARDS = require('../catalog/rewards'); const { publicUser } = require('./tree');
async function listRewards(userId) { const claimed = new Set((await db.rewards().find({ user_id: userId }).toArray()).map(x => x.reward_key)); return REWARDS.map(r => ({ ...r, claimed: claimed.has(r.key) })); }
async function claimReward(userId, key) {
  const reward = REWARDS.find(r => r.key === key); if (!reward) throw new HttpError(404, 'Recompensa não encontrada.');
  try {
    await db.transaction(async session => {
      const user = await db.users(session).findOne({ id: userId });
      if (user.highest_stage < reward.required_stage) throw new HttpError(403, `Evolua sua árvore até o nível ${reward.required_stage + 1} para liberar esta recompensa.`);
      if (user.coins < reward.coin_cost) throw new HttpError(409, 'Moedas insuficientes.');
      await db.rewards(session).insertOne({ user_id: userId, reward_key: key, claimed_at: new Date() });
      const update = await db.users(session).updateOne({ id: userId, coins: { $gte: reward.coin_cost } }, { $inc: { coins: -reward.coin_cost } });
      if (!update.modifiedCount) throw new HttpError(409, 'Moedas insuficientes.');
    });
  } catch (e) { if (e.code === 11000) throw new HttpError(409, 'Recompensa já resgatada.'); throw e; }
  return { user: await publicUser(userId), message: `Recompensa resgatada: ${reward.name}.` };
}
module.exports = { listRewards, claimReward };
