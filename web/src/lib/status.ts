import type { StatusConsulta, StatusProcedimento } from '../api/types';

export const TEXTO_STATUS_CONSULTA: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  chegou: 'Chegou',
  em_atendimento: 'Em atendimento',
  concluida: 'Concluída',
  faltou: 'Faltou',
  cancelada: 'Cancelada',
};

export const textoStatusConsulta = (s: StatusConsulta): string => TEXTO_STATUS_CONSULTA[s];

export const TEXTO_STATUS_PROC: Record<StatusProcedimento, string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};
