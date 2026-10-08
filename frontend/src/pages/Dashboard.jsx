import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/useAuth';
import SanctuaryTab from '../components/SanctuaryTab';
import MissionsTab from '../components/MissionsTab';
import RewardsTab from '../components/RewardsTab';
import ReferModal from '../components/ReferModal';
import Toast from '../components/Toast';
import '../styles/app.css';

export default function Dashboard() {
  const { user, setUser, logout } = useAuth();
  const [tab, setTab] = useState('santuario');
  const [showRefer, setShowRefer] = useState(false);
  const [toast, setToast] = useState(null);
  const [levels, setLevels] = useState(null);
  const [levelsError, setLevelsError] = useState(false);

  const notify = useCallback(message => setToast({ id: Date.now(), message }), []);
  const dismissToast = useCallback(id => setToast(t => (t?.id === id ? null : t)), []);

  // As missões ficam aqui (e não na aba) para alimentar o contador da aba. Recarregam quando um nível é liberado.
  useEffect(() => {
    api.get('/missions')
      .then(data => { setLevels(data); setLevelsError(false); })
      .catch(() => setLevelsError(true));
  }, [user.highest_stage]);

  /** Conclui a missão; devolve true se deu certo. */
  async function completeMission(mission) {
    try {
      const result = await api.post(`/missions/${mission.key}/complete`);
      setUser(result.user);
      setLevels(prev => prev.map(level => level.stage !== mission.stage ? level : {
        ...level,
        completed: level.completed + 1,
        missions: level.missions.map(m => (m.key === mission.key ? { ...m, completed: true } : m)),
      }));
      notify(result.message);
      return true;
    } catch (err) {
      notify(err.message);
      return false;
    }
  }

  const pendingMissions = levels?.filter(l => l.unlocked).reduce((sum, l) => sum + l.total - l.completed, 0) ?? 0;
  const tabs = [
    ['santuario', 'Meu santuário'],
    ['missoes', 'Missões', pendingMissions],
    ['recompensas', 'Recompensas'],
  ];

  return (
    <div className="forest-app">
      <header className="app-topbar">
        <div className="topbar-container">
          <div className="topbar-brand">
            <Link to="/" className="brand-logo-link" title="Ver apresentação da Amazônia">
              <span className="brand-leaf">🌳</span>
              <span className="brand-title">Árvore da Amazônia</span>
            </Link>
            <Link to="/" className="badge-about-link">Conhecer o Projeto ↗</Link>
          </div>

          <div className="topbar-stats">
            <div className="currency-pill seeds" title="Sementes para plantar">
              <span className="curr-icon">🌰</span>
              <span className="curr-val">{user.seeds}</span>
              <span className="curr-name">Sementes</span>
            </div>
            <div className="currency-pill coins" title="Moedas da floresta">
              <span className="curr-icon">🪙</span>
              <span className="curr-val">{user.coins}</span>
              <span className="curr-name">Moedas</span>
            </div>
            <button className="btn-refer-trigger" onClick={() => setShowRefer(true)} title="Indicar amigos e ganhar moedas">
              👥 Indicar Amigo
            </button>
            <div className="user-profile-menu">
              <span className="username-tag">@{user.username}</span>
              <button className="btn-logout" onClick={logout}>Sair</button>
            </div>
          </div>
        </div>
      </header>

      <nav className="view-switch-nav">
        {tabs.map(([key, label, badge]) => (
          <button key={key} className={`switch-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
            {badge > 0 && <span className="tab-badge" title="Missões pendentes nos níveis liberados">{badge}</span>}
          </button>
        ))}
      </nav>

      <main className={`forest-main ${tab === 'santuario' ? 'sanctuary-main' : ''}`}>
        {tab === 'santuario' && <SanctuaryTab user={user} setUser={setUser} notify={notify} onExploreMissions={() => setTab('missoes')} />}
        {tab === 'missoes' && <MissionsTab levels={levels} error={levelsError} currentLevel={user.highest_stage} onComplete={completeMission} />}
        {tab === 'recompensas' && <RewardsTab user={user} setUser={setUser} notify={notify} />}
      </main>

      <AnimatePresence>
        {showRefer && <ReferModal referralCode={user.referral_code} onClose={() => setShowRefer(false)} />}
      </AnimatePresence>

      <div className="toast-container" aria-live="polite">
        <AnimatePresence>
          {toast && <Toast key={toast.id} id={toast.id} message={toast.message} onDone={dismissToast} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
