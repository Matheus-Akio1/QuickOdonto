import { createContext } from 'react';
import type { Me } from '../api/types';

export interface ContextoAuth {
  usuario: Me | null;
  carregando: boolean;
  mensagemSessao: string | null;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

export const AuthContext = createContext<ContextoAuth | null>(null);
