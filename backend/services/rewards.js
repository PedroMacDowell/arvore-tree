const db = require('../db');
const HttpError = require('../http-error');
const REWARDS = require('../catalog/rewards');
const { publicUser } = require('./tree');

function listRewards(userId) {
  const claimed = new Set(db.prepare('SELECT reward_key FROM reward_claims WHERE user_id = ?').pluck().all(userId));
  return REWARDS.map(reward => ({ ...reward, claimed: claimed.has(reward.key) }));
}

const claimReward = db.transaction((userId, key) => {
  const reward = REWARDS.find(r => r.key === key);
  if (!reward) throw new HttpError(404, 'Recompensa não encontrada.');

  const user = db.prepare('SELECT coins, highest_stage FROM users WHERE id = ?').get(userId);
  if (user.highest_stage < reward.required_stage) throw new HttpError(403, `Evolua sua árvore até o nível ${reward.required_stage + 1} para liberar esta recompensa.`);
  if (db.prepare('SELECT 1 FROM reward_claims WHERE user_id = ? AND reward_key = ?').get(userId, key)) throw new HttpError(409, 'Recompensa já resgatada.');
  if (user.coins < reward.coin_cost) throw new HttpError(409, 'Moedas insuficientes.');

  db.prepare('INSERT INTO reward_claims (user_id, reward_key) VALUES (?, ?)').run(userId, key);
  db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(reward.coin_cost, userId);
  return { user: publicUser(userId), message: `Recompensa resgatada: ${reward.name}.` };
});

module.exports = { listRewards, claimReward };
