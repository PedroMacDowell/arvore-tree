import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** Jogador logado e ações de conta. undefined = carregando · null = visitante. */
export function useAuth() {
  return useContext(AuthContext);
}
