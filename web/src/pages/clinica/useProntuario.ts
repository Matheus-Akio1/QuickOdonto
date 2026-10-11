import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, chamar } from '../../api/client';

/**
 * Conteúdo clínico: sem cache residual (gcTime 0) — sai da memória assim que a tela fecha,
 * e cada nova abertura é uma nova leitura registrada no servidor (RF-CLI-015).
 */
export const CLINICO = { gcTime: 0, staleTime: 0 } as const;
export const chave = (id: string, ...resto: string[]) => ['prontuario', id, ...resto];

export function useResumo(id: string) {
  return useQuery({
    queryKey: chave(id),
    queryFn: () => chamar(api.GET('/pacientes/{id}/prontuario', { params: { path: { id } } })),
    ...CLINICO,
  });
}

export function useProcedimentos(id: string) {
  return useQuery({
    queryKey: chave(id, 'procedimentos'),
    queryFn: () => chamar(api.GET('/pacientes/{id}/procedimentos', { params: { path: { id } } })),
    ...CLINICO,
  });
}

export function useCatalogo(ativo: 'true' | 'todos' = 'true') {
  return useQuery({
    queryKey: ['catalogo', ativo],
    queryFn: () => chamar(api.GET('/procedimentos', { params: { query: { ativo } } })),
    staleTime: 60_000,
  });
}

/** Após qualquer escrita no prontuário, tudo do paciente é relido. */
export function useInvalidarProntuario(id: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: chave(id) });
}
