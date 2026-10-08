import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useLinkToken } from '../linkToken';
import AuthLayout from '../components/AuthLayout';

/** /redefinir-senha#token=… — define a nova senha pelo link recebido por e-mail. */
export default function ResetPasswordPage() {
  const token = useLinkToken();
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <AuthLayout title="Link inválido." description="Abra o link mais recente que enviamos para o seu e-mail ou peça um novo.">
        <Link to="/esqueci-senha" className="auth-submit">Pedir um novo link</Link>
      </AuthLayout>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (password !== confirmation) {
      setError('As senhas não são iguais.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await resetPassword(token, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Crie uma nova senha." description="Por segurança, você será desconectado de todos os outros dispositivos.">
      <form className="auth-form" onSubmit={submit}>
        <div className="field-group">
          <label className="field-label" htmlFor="password">Nova senha</label>
          <input
            id="password"
            className="field-input"
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="Mínimo de 6 caracteres"
            autoComplete="new-password"
            minLength={6}
            maxLength={72}
            required
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="confirmation">Repita a nova senha</label>
          <input
            id="confirmation"
            className="field-input"
            type="password"
            value={confirmation}
            onChange={e => { setConfirmation(e.target.value); setError(''); }}
            autoComplete="new-password"
            minLength={6}
            maxLength={72}
            required
          />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Salvando…' : 'Salvar nova senha'}</button>
        <Link to="/esqueci-senha" className="auth-link">Pedir um novo link</Link>
      </form>
    </AuthLayout>
  );
}
