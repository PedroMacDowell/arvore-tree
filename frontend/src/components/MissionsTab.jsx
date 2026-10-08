import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CATEGORY_LABELS, STAGES } from '../constants';
import MissionModal from './MissionModal';

/** Aba "Missões": um nível por estágio da árvore, filtro por tema e leitura da missão. */
export default function MissionsTab({ levels, error, currentLevel, onComplete }) {
  const [selectedLevel, setSelectedLevel] = useState(null); // null = acompanha o nível atual
  const [category, setCategory] = useState('todas');
  const [openMission, setOpenMission] = useState(null);
  const [completing, setCompleting] = useState(false);

  const loading = !levels && !error;
  const visibleLevel = selectedLevel ?? currentLevel;
  const level = levels?.[visibleLevel];
  const missions = level?.missions.filter(m => category === 'todas' || m.category === category) ?? [];

  async function complete(mission) {
    setCompleting(true);
    const ok = await onComplete(mission);
    setCompleting(false);
    if (ok) setOpenMission(null);
  }

  return (
    <div className="missions-isolated-view">
      <section className="amazon-missions-section">
        <div className="missions-header">
          <div>
            <h3 className="section-title">Missões de Conscientização Amazônica</h3>
            <p className="section-desc">
              Cada nível libera 10 missões inéditas conforme sua árvore cresce. Ganhe moedas, fertilizante e proteção nas missões e acompanhe sua árvore por 14 dias de cuidado.
            </p>
          </div>
          <div className="missions-counters">
            <div className="counter-item">
              <span className="counter-num">{level ? level.completed : '—'}</span>
              <span className="counter-label">Concluídas neste nível</span>
            </div>
            <div className="counter-item pending">
              <span className="counter-num">{level ? level.total - level.completed : '—'}</span>
              <span className="counter-label">Disponíveis neste nível</span>
            </div>
          </div>
        </div>

        {loading && <p role="status">Carregando missões…</p>}
        {error && <p role="alert">Não foi possível carregar as missões. Atualize a página para tentar novamente.</p>}

        {level && <>
          <div className="mission-levels" aria-label="Missões por nível">
            {levels.map(l => (
              <button
                key={l.stage}
                disabled={!l.unlocked}
                aria-pressed={visibleLevel === l.stage}
                className={visibleLevel === l.stage ? 'active' : ''}
                onClick={() => { setSelectedLevel(l.stage); setCategory('todas'); }}
              >
                <span>{l.unlocked ? `Nível ${l.stage + 1}` : 'Bloqueado'}</span>
                <strong>{STAGES[l.stage]}</strong>
                <small>{l.unlocked ? `${l.completed}/${l.total} concluídas` : `${l.total} novas missões`}</small>
              </button>
            ))}
          </div>
          <p className="mission-level-summary">
            Nível {visibleLevel + 1} · {STAGES[visibleLevel]} · {level.theme} — {level.completed} de {level.total} missões concluídas
          </p>

          <div className="filter-scroll-row">
            <span className="filter-label">Temas:</span>
            {['todas', ...Object.keys(CATEGORY_LABELS)].map(cat => (
              <button key={cat} className={`filter-pill ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
                {CATEGORY_LABELS[cat] ?? 'Todas'}
              </button>
            ))}
          </div>

          {missions.length === 0 && <p className="mission-level-summary">Nenhuma missão deste tema neste nível. Escolha outro tema.</p>}
          <div className="missions-grid">
            {missions.map(mission => (
              <motion.div
                key={mission.key}
                className={`mission-card ${mission.completed ? 'completed' : ''}`}
                layout
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
              >
                <div className="mission-card-top">
                  <span className="mission-category-tag">{CATEGORY_LABELS[mission.category]}</span>
                  <div className="mission-rewards-tag">
                    <span>🪙 +{mission.coin_reward}</span><span>🌿 +{mission.fertilizer_reward}</span><span>🛡 +{mission.protection_reward}</span>
                  </div>
                </div>
                <h4 className="mission-card-title">{mission.title}</h4>
                <p className="mission-card-desc">{mission.description}</p>
                <div className="mission-card-bottom">
                  {mission.completed ? (
                    <span className="mission-done-badge">✓ Missão Concluída</span>
                  ) : (
                    <button className="btn-mission-action" onClick={() => setOpenMission(mission)}>
                      {mission.type === 'leitura' ? 'Ler & Completar Missão →' : 'Fazer Atividade →'}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </>}
      </section>

      <AnimatePresence>
        {openMission && (
          <MissionModal mission={openMission} onClose={() => setOpenMission(null)} onComplete={complete} completing={completing} />
        )}
      </AnimatePresence>
    </div>
  );
}
