const db = require('../db');
const HttpError = require('../http-error');
const REWARDS = require('../catalog/rewards');
const { publicUser } = require('./tree');

async function listRewards(userId) {
  const claimed = new Set((await db.all('SELECT reward_key FROM reward_claims WHERE user_id = ?', userId)).map(row => row.reward_key));
  return REWARDS.map(reward => ({ ...reward, claimed: claimed.has(reward.key) }));
}

function claimReward(userId, key) {
  const reward = REWARDS.find(r => r.key === key);
  if (!reward) throw new HttpError(404, 'Recompensa não encontrada.');
  return db.transaction(async tx => {
    const user = await tx.get('SELECT coins, highest_stage FROM users WHERE id = ?', userId);
    if (user.highest_stage < reward.required_stage) throw new HttpError(403, `Evolua sua árvore até o nível ${reward.required_stage + 1} para liberar esta recompensa.`);
    if (await tx.get('SELECT 1 FROM reward_claims WHERE user_id = ? AND reward_key = ?', userId, key)) throw new HttpError(409, 'Recompensa já resgatada.');
    if (user.coins < reward.coin_cost) throw new HttpError(409, 'Moedas insuficientes.');

    await tx.run('INSERT INTO reward_claims (user_id, reward_key) VALUES (?, ?)', userId, key);
    await tx.run('UPDATE users SET coins = coins - ? WHERE id = ?', reward.coin_cost, userId);
    return { user: await publicUser(userId, tx), message: `Recompensa resgatada: ${reward.name}.` };
  });
}

module.exports = { listRewards, claimReward };
