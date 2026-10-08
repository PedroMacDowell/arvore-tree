import { useEffect, useState } from 'react';
import { api } from '../api';

/** Aba "Recompensas": troca de moedas por conquistas simbólicas, liberadas por nível. */
export default function RewardsTab({ user, setUser, notify }) {
  const [rewards, setRewards] = useState(null);

  useEffect(() => {
    api.get('/rewards').then(setRewards).catch(err => notify(err.message));
  }, [notify]);

  async function claim(reward) {
    try {
      const result = await api.post(`/rewards/${reward.key}/claim`);
      setUser(result.user);
      setRewards(list => list.map(r => (r.key === reward.key ? { ...r, claimed: true } : r)));
      notify(result.message);
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <div className="rewards-center-view">
      <div className="rewards-header-banner">
        <h2>Recompensas da Floresta</h2>
        <p>
          Troque suas <strong>Moedas da Floresta 🪙</strong> ganhas ao estudar sobre a Amazônia por conquistas simbólicas que homenageiam viveiros, brigadistas e a conservação comunitária. Cada resgate fica registrado na sua conta.
        </p>
        <div className="balance-reminder">
          Seu Saldo Atual: <strong>{user.coins} Moedas</strong>
        </div>
      </div>

      {!rewards && <p role="status">Carregando recompensas…</p>}
      <div className="rewards-cards-grid">
        {rewards?.map(reward => {
          const levelLocked = user.highest_stage < reward.required_stage;
          const canAfford = user.coins >= reward.coin_cost;
          const label = levelLocked ? `Libera no nível ${reward.required_stage + 1}`
            : reward.claimed ? 'Resgatada ✓'
            : canAfford ? 'Resgatar Recompensa'
            : 'Moedas Insuficientes';
          return (
            <div key={reward.key} className={`eco-reward-card ${reward.claimed ? 'claimed' : !canAfford ? 'locked' : ''}`}>
              <div className="reward-icon-badge">{reward.icon}</div>
              <h4 className="reward-title">{reward.name}</h4>
              <p className="reward-description">{reward.description}</p>
              <div className="reward-pricing-row">
                <span>🪙 {reward.coin_cost} Moedas</span>
              </div>
              <button className="btn-claim-reward" disabled={reward.claimed || !canAfford || levelLocked} onClick={() => claim(reward)}>
                {label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
