import { CATEGORY_LABELS } from '../constants';
import Modal from './Modal';

export default function MissionModal({ mission, onClose, onComplete, completing }) {
  const isReading = mission.type === 'leitura';
  return (
    <Modal
      onClose={onClose}
      tags={<>
        <span className="task-category-badge">{CATEGORY_LABELS[mission.category]}</span>
        <span className="modal-badge-rewards">
          <span>🪙 +{mission.coin_reward} Moedas</span>
          <span>🌿 +{mission.fertilizer_reward} Fertilizante</span>
          <span>🛡 +{mission.protection_reward} Proteção</span>
        </span>
      </>}
    >
      <h3 className="modal-title">{mission.title}</h3>
      <p className="modal-lead">{mission.description}</p>

      <div className="modal-content-box">
        <div className="modal-content-header">
          {isReading ? '📖 Leitura & Conscientização Amazônica' : '🔎 Atividade de Investigação'}
        </div>
        <p className="modal-text">
          {isReading ? mission.content : 'Reserve alguns minutos para a atividade acima. Ao terminar, registre mentalmente sua descoberta e conclua a missão.'}
        </p>
        {mission.source_url && (
          <div className="modal-source">
            <span>Fonte científica recomendada: </span>
            <a href={mission.source_url} target="_blank" rel="noreferrer">{mission.source_url} ↗</a>
          </div>
        )}
      </div>

      <p className="field-subtext">As recompensas vão para o seu inventário. Use fertilizante e proteção no santuário quando sua árvore precisar.</p>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>Fechar</button>
        {mission.completed ? (
          <div className="mission-completed-flag">✓ Missão Concluída e Recompensas Concedidas</div>
        ) : (
          <button className="btn-complete-mission" onClick={() => onComplete(mission)} disabled={completing}>
            {completing ? 'Concluindo…' : isReading ? 'Compreendi a Leitura • Concluir Missão' : 'Fiz a Atividade • Concluir Missão'}
          </button>
        )}
      </div>
    </Modal>
  );
}
