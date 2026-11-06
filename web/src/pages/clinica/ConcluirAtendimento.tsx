import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconeCheck } from '../../components/Icones';
import { hoje, isoLocal, somarDias } from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { CONCLUI_NO_PRONTUARIO } from '../agenda/fluxo';
import { useMudarStatus } from '../agenda/useMudarStatus';

/**
 * Botão do prontuário que encerra a consulta de hoje. Só aparece para o dentista da consulta,
 * depois que a Secretaria registrou a chegada — é isso que tira o paciente do quadro do dia.
 */
export function ConcluirAtendimento({ pacienteId, nome }: { pacienteId: string; nome: string }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const mudar = useMudarStatus();
  const inicio = isoLocal(hoje(), '00:00');
  const fim = isoLocal(somarDias(hoje(), 1), '00:00');
  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim],
    queryFn: () => chamar(api.GET('/consultas', { params: { query: { inicio, fim } } })),
  });
  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });

  const meu = profs.data?.find((p) => p.usuario_id === usuario?.id);
  const consulta = consultas.data?.find(
    (c) =>
      c.paciente.id === pacienteId &&
      c.profissional.id === meu?.id &&
      CONCLUI_NO_PRONTUARIO.includes(c.status),
  );
  if (!consulta) return null;

  return (
    <>
      <button type="button" className="btn sec" onClick={() => setConfirmar(true)}>
        <IconeCheck />
        Concluir atendimento
      </button>
      {confirmar && (
        <ConfirmDialog
          titulo="Concluir atendimento"
          confirmar="Concluir"
          carregando={mudar.isPending}
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() =>
            mudar.mutate(
              { id: consulta.id, status: 'concluida' },
              {
                onSuccess: () => {
                  setConfirmar(false);
                  avisar('Atendimento concluído.', 'ok');
                },
              },
            )
          }
        >
          A consulta de hoje de {nome} será encerrada e sai do quadro da Secretaria. Confira se a
          evolução já foi registrada.
        </ConfirmDialog>
      )}
    </>
  );
}
