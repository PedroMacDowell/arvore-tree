import { useState } from 'react';
import Modal from './Modal';

// Bônus definidos em backend/services/accounts.js (REFERRAL_BONUS).
export default function ReferModal({ referralCode, onClose }) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}/login?ref=${referralCode}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Área de transferência indisponível: o link continua visível abaixo para copiar à mão.
    }
  }

  return (
    <Modal
      onClose={onClose}
      tags={<>
        <span className="task-category-badge highlight">Rede de Guardiões</span>
        <span className="modal-badge-rewards">
          <span>🪙 +25 Moedas por amigo (até 10)</span>
          <span>🪙 +10 Moedas para quem entrar</span>
        </span>
      </>}
    >
      <h3 className="modal-title">Indicar um Amigo para o Movimento</h3>
      <p className="modal-lead">
        A preservação da Amazônia se multiplica quando mais pessoas aprendem e agem. Quando alguém criar uma conta
        pelo seu link ou com o seu código e confirmar o e-mail, a pessoa já começa com 10 moedas extras e você
        ganha 25 moedas (pelos seus 10 primeiros amigos).
      </p>

      <div className="referral-box">
        <span className="field-label">Seu Código de Guardião:</span>
        <div className="code-display-row">
          <span className="code-pill">{referralCode}</span>
          <button className="btn-copy" onClick={copyLink}>{copied ? '✓ Copiado!' : 'Copiar Link de Convite'}</button>
        </div>
        <span className="field-subtext">Link: {inviteLink}</span>
      </div>

      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>Concluir</button>
      </div>
    </Modal>
  );
}
