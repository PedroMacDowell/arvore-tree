import { useEffect, useState } from 'react';
import { api } from '../api';
import { CARE_DAYS } from '../constants';
import TreeDisplay from './TreeDisplay';

/** Aba "Meu santuário": árvore, cuidados, floresta e renomear. */
export default function SanctuaryTab({ user, setUser, notify, onExploreMissions }) {
  const [busy, setBusy] = useState(false);
  const [forest, setForest] = useState([]);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user.tree_name);

  // Recarrega quando uma árvore completa (deixa de crescer) ou uma nova é plantada.
  useEffect(() => {
    api.get('/tree/forest').then(setForest).catch(() => {});
  }, [user.tree_cycle, user.is_growing]);

  /** Envia uma ação da árvore; devolve a resposta ou null em caso de erro. */
  async function act(path, body) {
    if (busy) return null;
    setBusy(true);
    try {
      const result = await api.post(path, body);
      setUser(result.user);
      notify(result.message);
      return result;
    } catch (err) {
      notify(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!name.trim()) return;
    try {
      const result = await api.patch('/tree/name', { name });
      setUser(result.user);
      notify(result.message);
    } catch (err) {
      notify(err.message);
    }
    setEditingName(false);
  }

  return (
    <div className="tree-isolated-view">
      <section className="tree-centerpiece-section">
        <TreeDisplay user={user} busy={busy} onPlant={() => act('/tree/plant')} onWater={() => act('/tree/water')} />

        {user.is_growing && (
          <section className="tree-care-panel" aria-label="Cuidados da árvore">
            <div>
              <h3>Seu cuidado faz crescer</h3>
              <p>Regue uma vez por dia. Dias ausentes não tiram seu progresso.</p>
              <strong>Solo: {user.soil}/100 · {user.pests ? 'Insetos precisam de atenção' : 'Sem insetos'}</strong>
            </div>
            <button disabled={busy || user.soil > 40 || !user.fertilizer} onClick={() => act('/tree/care', { item: 'fertilizer' })}>
              🌿 Fertilizar · {user.fertilizer}
            </button>
            <button disabled={busy || !user.pests || !user.insect_protection} onClick={() => act('/tree/care', { item: 'protection' })}>
              🛡 Tratar insetos · {user.insect_protection}
            </button>
            <p>O solo perde nutrientes a cada rega. Complete missões para repor fertilizante e proteção. Sem cuidados, o crescimento espera por você.</p>
          </section>
        )}

        <section className="tree-care-panel">
          <div>
            <h3>Minha floresta · {forest.length}</h3>
            <p>{forest.length ? 'Cada árvore adulta guarda uma história de cuidado.' : `Sua primeira árvore entra aqui ao completar ${CARE_DAYS} regas diárias.`}</p>
          </div>
          {forest.map(tree => (
            <div className="forest-tree-card" key={tree.cycle}>
              <span aria-hidden="true">🌳</span>
              <strong>{tree.name}</strong>
              <small>{CARE_DAYS} dias de cuidado · concluída em {tree.completed_at.split('-').reverse().join('/')}</small>
            </div>
          ))}
        </section>

        <div className="tree-action-bar">
          {editingName ? (
            <div className="name-edit-box">
              <input
                className="field-input name-input"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                maxLength={40}
                aria-label="Nome da árvore"
                autoFocus
              />
              <button className="btn-save-tree" onClick={saveName}>Salvar</button>
              <button className="btn-cancel-edit" onClick={() => setEditingName(false)}>Cancelar</button>
            </div>
          ) : (
            <button className="btn-rename-tree" onClick={() => { setName(user.tree_name); setEditingName(true); }}>
              Renomear árvore
            </button>
          )}
          <button className="btn-switch-to-missions" onClick={onExploreMissions}>Explorar missões →</button>
        </div>
      </section>
    </div>
  );
}
