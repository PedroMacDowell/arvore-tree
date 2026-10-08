import { Link } from 'react-router-dom';
import '../styles/auth.css';

/** Cartão das telas de conta: login, cadastro, confirmação de e-mail e senha. */
export default function AuthLayout({ title, description, children }) {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-top-nav">
          <Link to="/" className="auth-back-link">← Conhecer o Projeto Amazônia</Link>
        </div>
        <div className="auth-brand-badge">
          <span className="auth-logo-icon">🌳</span>
          <span className="auth-brand-tag">Árvore da Amazônia</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        {description && <p className="auth-desc">{description}</p>}
        {children}
      </div>
    </div>
  );
}
