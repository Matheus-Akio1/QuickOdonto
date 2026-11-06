import type { StatusConsulta } from '../../api/types';

/** Ações da Secretaria no quadro — espelha o backend (agenda.service.js), que continua sendo quem decide. */
export const PROXIMO: Partial<Record<StatusConsulta, StatusConsulta>> = {
  agendada: 'confirmada',
  confirmada: 'chegou',
};
/** Depois da chegada, a consulta só sai do fluxo quando o dentista conclui o atendimento no prontuário. */
export const CONCLUI_NO_PRONTUARIO: StatusConsulta[] = ['chegou', 'em_atendimento'];
export const PODE_FALTAR: StatusConsulta[] = ['agendada', 'confirmada'];
export const PODE_CANCELAR: StatusConsulta[] = ['agendada', 'confirmada', 'chegou'];
export const PODE_REAGENDAR: StatusConsulta[] = ['agendada', 'confirmada'];

export const ROTULO_ACAO: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmar',
  chegou: 'Marcar chegada',
  em_atendimento: 'Chamar para a cadeira',
  concluida: 'Finalizar atendimento',
  faltou: 'Marcar falta',
  cancelada: 'Cancelar',
};
