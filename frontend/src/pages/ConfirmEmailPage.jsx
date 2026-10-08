import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useLinkToken } from '../linkToken';
import AuthLayout from '../components/AuthLayout';

/**
 * /confirmar-email#token=… — ativa a conta. A confirmação exige um clique: programas de e-mail que
 * abrem links sozinhos (verificadores de segurança) não gastam o link no lugar da pessoa.
 */
export default function ConfirmEmailPage() {
  const token = useLinkToken();
  const { confirmEmail } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setLoading(true);
    setError('');
    try {
      await confirmEmail(token);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Link inválido." description="Abra o link mais recente que enviamos para o seu e-mail ou faça o cadastro novamente.">
        <Link to="/login?tab=register" className="auth-submit">Fazer cadastro</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirme seu e-mail." description="Falta um clique para ativar sua conta e plantar sua primeira semente de sumaúma.">
      <div className="auth-form">
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" onClick={confirm} disabled={loading}>{loading ? 'Ativando…' : 'Confirmar meu e-mail'}</button>
        {error && <Link to="/login?tab=register" className="auth-link">Fazer o cadastro novamente</Link>}
      </div>
    </AuthLayout>
  );
}
