import { useEffect } from 'react';
import { motion } from 'framer-motion';

/** Janela sobreposta. Fecha no ✕, no clique fora ou com Esc. `tags` aparece no topo, ao lado do ✕. */
export default function Modal({ onClose, tags, className = '', children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        className={`modal-card ${className}`}
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25 }}
      >
        <div className="modal-header">
          <div className="modal-tag-row">{tags}</div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
