import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, aoSessaoExpirar, chamar, definirCsrf } from '../api/client';
import type { Me } from '../api/types';
import { AuthContext } from './context';

/**
 * Estado de sessão só em memória: nada vai para localStorage/sessionStorage/IndexedDB.
 * Ao recarregar a página, GET /auth/me (com renovação transparente) restaura a sessão a partir do cookie.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [usuario, setUsuario] = useState<Me | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagemSessao, setMensagemSessao] = useState<string | null>(null);
  const logado = useRef(false);
  logado.current = usuario !== null;

  const limpar = useCallback(() => {
    definirCsrf(null);
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  const carregarMe = useCallback(async () => {
    const me = await chamar(api.GET('/auth/me'));
    definirCsrf(me.csrfToken);
    setUsuario(me);
  }, []);

  useEffect(() => {
    aoSessaoExpirar(() => {
      // Só avisa se havia sessão; na checagem inicial (sem cookie) o 401 é o caminho normal.
      if (logado.current) setMensagemSessao('Sua sessão expirou. Entre novamente.');
      limpar();
    });
    carregarMe()
      .catch(() => limpar())
      .finally(() => setCarregando(false));
  }, [carregarMe, limpar]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const r = await chamar(api.POST('/auth/login', { body: { email, senha } }));
      definirCsrf(r.csrfToken);
      setMensagemSessao(null);
      await carregarMe();
    },
    [carregarMe],
  );

  const sair = useCallback(async () => {
    try {
      await chamar(api.POST('/auth/logout'));
    } finally {
      limpar();
      setMensagemSessao(null);
    }
  }, [limpar]);

  const valor = useMemo(
    () => ({ usuario, carregando, mensagemSessao, entrar, sair }),
    [usuario, carregando, mensagemSessao, entrar, sair],
  );
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
