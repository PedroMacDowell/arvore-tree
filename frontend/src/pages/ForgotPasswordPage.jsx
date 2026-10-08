import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import AuthLayout from '../components/AuthLayout';

/** /esqueci-senha — pede o link de redefinição por e-mail. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      setNotice((await api.post('/auth/forgot-password', { email })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Esqueceu a senha?" description="Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha.">
      {notice ? (
        <div className="auth-form">
          <p className="auth-notice" role="status">{notice}</p>
          <Link to="/login" className="auth-link">Voltar para o login</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <div className="field-group">
            <label className="field-label" htmlFor="email">E-mail</label>
            <input
              id="email"
              className="field-input"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="seu.email@exemplo.com"
              autoComplete="email"
              required
            />
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Enviando…' : 'Enviar link'}</button>
          <Link to="/login" className="auth-link">Voltar para o login</Link>
        </form>
      )}
    </AuthLayout>
  );
}
