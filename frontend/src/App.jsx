import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './context/useAuth';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ConfirmEmailPage from './pages/ConfirmEmailPage';
import Dashboard from './pages/Dashboard';

/** Libera a página só para quem está (loggedIn) ou não está logado; senão redireciona. */
function Gate({ loggedIn, redirectTo, children }) {
  const { user } = useAuth();
  if (user === undefined) return <div className="loading-screen">🌿 Conectando à floresta…</div>;
  if (Boolean(user) !== loggedIn) return <Navigate to={redirectTo} replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Gate loggedIn={false} redirectTo="/app"><AuthPage /></Gate>} />
          <Route path="/esqueci-senha" element={<Gate loggedIn={false} redirectTo="/app"><ForgotPasswordPage /></Gate>} />
          {/* Links dos e-mails: abrem mesmo com outra conta logada no navegador. */}
          <Route path="/confirmar-email" element={<ConfirmEmailPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/app" element={<Gate loggedIn redirectTo="/"><Dashboard /></Gate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
