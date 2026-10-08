import { useEffect, useState } from 'react';
import { api } from '../api';
import { AuthContext } from './useAuth';

export function AuthProvider({ children }) {
  // undefined = carregando · null = visitante · objeto = jogador logado
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.get('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  // Mantém o estado em dia ao voltar para a aba e a cada minuto: a rega libera na virada do dia.
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      api.get('/auth/me').then(setUser).catch(err => { if (err.status === 401) setUser(null); });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user?.id]);

  const value = {
    user,
    setUser,
    login: async (email, password) => setUser(await api.post('/auth/login', { email, password })),
    // O cadastro só envia o e-mail de confirmação; a conta é criada (e a sessão aberta) ao confirmar.
    register: async fields => (await api.post('/auth/register', fields)).message,
    confirmEmail: async token => setUser(await api.post('/auth/confirm-email', { token })),
    resetPassword: async (token, password) => setUser(await api.post('/auth/reset-password', { token, password })),
    logout: async () => {
      await api.post('/auth/logout').catch(() => {});
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
