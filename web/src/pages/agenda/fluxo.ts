import type { StatusConsulta } from '../../api/types';

/** Espelha as transições aceitas pelo backend (agenda.service.js). O servidor continua sendo quem decide. */
export const PROXIMO: Partial<Record<StatusConsulta, StatusConsulta>> = {
  agendada: 'confirmada',
  confirmada: 'chegou',
  chegou: 'em_atendimento',
  em_atendimento: 'concluida',
};
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
