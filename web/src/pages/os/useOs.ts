import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { EtapaProducao } from '../../api/types';
import { somarDias, hoje, isoLocal } from '../../lib/datas';
import { useToast } from '../../toast/useToast';

/** Observações da OS são texto cifrado no servidor: nada de cache residual no detalhe. */
export const SEM_CACHE = { gcTime: 0, staleTime: 0 } as const;

export function useOrdens(status: 'aberta' | 'cancelada') {
  return useQuery({
    queryKey: ['os', 'lista', status],
    queryFn: () => chamar(api.GET('/ordens-servico', { params: { query: { status } } })),
    refetchInterval: 60_000,
  });
}

/** Concluídas nos últimos 7 dias (coluna "Concluída" e indicador da semana). */
export function useConcluidasDaSemana() {
  const inicio = isoLocal(somarDias(hoje(), -7), '00:00');
  return useQuery({
    queryKey: ['os', 'lista', 'concluida', inicio],
    queryFn: () =>
      chamar(api.GET('/ordens-servico', { params: { query: { status: 'concluida', inicio } } })),
  });
}

export function useOs(id: string) {
  return useQuery({
    queryKey: ['os', 'detalhe', id],
    queryFn: () => chamar(api.GET('/ordens-servico/{id}', { params: { path: { id } } })),
    ...SEM_CACHE,
  });
}

export function useInvalidarOs() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['os'] });
    qc.invalidateQueries({ queryKey: ['lab-clientes'] });
    qc.invalidateQueries({ queryKey: ['paciente'] });
  };
}

export interface Movimento {
  id: string;
  etapa: EtapaProducao | 'entregue';
}

/** Move a OS na produção (só o laboratório) e relê o que depende dela. */
export function useMoverOs(aoConcluir?: () => void) {
  const invalidar = useInvalidarOs();
  const { avisar } = useToast();
  return useMutation({
    mutationFn: ({ id, ...body }: Movimento) =>
      chamar(api.PATCH('/ordens-servico/{id}/etapa', { params: { path: { id } }, body })),
    onSuccess: () => {
      invalidar();
      aoConcluir?.();
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
}
