import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/useAuth';
import AuthLayout from '../components/AuthLayout';

const TEXTS = {
  login: {
    title: 'Bem-vindo de volta, Guardião.',
    description: 'Acesse seu viveiro virtual para acompanhar o crescimento da sua árvore e novas missões.',
  },
  register: {
    title: 'Plante sua Sumaúma no coração da floresta.',
    description: 'Junte-se à rede de conscientização. Cada tarefa lida e assimilada gera nutrientes para a mata.',
  },
};

export default function AuthPage() {
  const { login, register } = useAuth();
  const [searchParams] = useSearchParams();
  const referralFromLink = searchParams.get('ref') || '';

  const [mode, setMode] = useState(searchParams.get('tab') === 'register' || referralFromLink ? 'register' : 'login');
  const [form, setForm] = useState({ username: '', email: '', password: '', referral_code: referralFromLink });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState(''); // e-mail que recebeu o link de confirmação
  const isLogin = mode === 'login';

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  }

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await login(form.email, form.password);
      } else {
        await register(form);
        setSentTo(form.email.trim());
      }
    } catch (err) {
      setError(err.status === 401 ? `${err.message} Se acabou de se cadastrar, confirme seu e-mail antes de entrar.` : err.message);
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) return <CheckEmail email={sentTo} onBack={() => { setSentTo(''); switchMode('login'); }} />;

  return (
    <AuthLayout title={TEXTS[mode].title} description={TEXTS[mode].description}>
      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={isLogin} className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => switchMode('login')}>
          Acessar Conta
        </button>
        <button role="tab" aria-selected={!isLogin} className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => switchMode('register')}>
          Cadastrar Novo Guardião
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.form
          key={mode}
          onSubmit={submit}
          className="auth-form"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {!isLogin && (
            <div className="field-group">
              <label className="field-label" htmlFor="username">Seu Nome / Nome de Guardião</label>
              <input
                id="username"
                className="field-input"
                type="text"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="Ex: Curupira, Yara, Marina..."
                autoComplete="username"
                minLength={2}
                maxLength={30}
                required
              />
            </div>
          )}

          <div className="field-group">
            <label className="field-label" htmlFor="email">E-mail</label>
            <input
              id="email"
              className="field-input"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="seu.email@exemplo.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="password">Senha</label>
            <input
              id="password"
              className="field-input"
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={isLogin ? '••••••••' : 'Mínimo de 6 caracteres'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={isLogin ? undefined : 6}
              maxLength={72}
              required
            />
          </div>

          {!isLogin && (
            <div className="field-group">
              <label className="field-label" htmlFor="referral">
                Código de indicação de um amigo (opcional · +10 moedas para começar)
              </label>
              <input
                id="referral"
                className="field-input highlight-ref"
                type="text"
                value={form.referral_code}
                onChange={e => set('referral_code', e.target.value)}
                placeholder="Ex: AMZ-1234"
              />
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.p
                className="auth-error"
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Cultivando dados…' : isLogin ? 'Entrar no Viveiro' : 'Semear Minha Árvore'}
          </button>
          {isLogin && <Link to="/esqueci-senha" className="auth-link">Esqueci minha senha</Link>}
        </motion.form>
      </AnimatePresence>
    </AuthLayout>
  );
}

/** Depois do cadastro: avisa sobre o e-mail de confirmação e permite pedir outro link. */
function CheckEmail({ email, onBack }) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function resend() {
    setLoading(true);
    setError('');
    try {
      setNotice((await api.post('/auth/resend-confirmation', { email })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Confira seu e-mail."
      description={`Enviamos uma mensagem para ${email} com o próximo passo. Abra o link para ativar sua conta e plantar sua primeira semente (ele vale por 24 horas).`}
    >
      <div className="auth-form">
        <p className="auth-notice">Não chegou em alguns minutos? Procure na caixa de spam ou peça um novo link.</p>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" onClick={resend} disabled={loading}>{loading ? 'Enviando…' : 'Reenviar link de confirmação'}</button>
        <button className="auth-link" onClick={onBack}>Voltar para o login</button>
      </div>
    </AuthLayout>
  );
}
