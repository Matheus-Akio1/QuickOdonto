import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { StatusConsulta } from '../../api/types';
import { useToast } from '../../toast/useToast';

type Alvo = Exclude<StatusConsulta, 'agendada' | 'cancelada'>;

/** Move a consulta de status e revalida tudo que depende da agenda. */
export function useMudarStatus() {
  const qc = useQueryClient();
  const { avisar } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Alvo }) =>
      chamar(api.PATCH('/consultas/{id}/status', { params: { path: { id } }, body: { status } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] });
      qc.invalidateQueries({ queryKey: ['consulta'] });
      qc.invalidateQueries({ queryKey: ['paciente'] });
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
}
