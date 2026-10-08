import type { StatusConsulta, Usuario } from '../api/types';

const CONSULTA: Record<StatusConsulta, { texto: string; classe: string }> = {
  agendada: { texto: 'Agendada', classe: 'badge-info' },
  confirmada: { texto: 'Confirmada', classe: 'badge-primary' },
  chegou: { texto: 'Chegou', classe: 'badge-warn' },
  em_atendimento: { texto: 'Em atendimento', classe: 'badge-violet' },
  concluida: { texto: 'Concluída', classe: 'badge-ok' },
  faltou: { texto: 'Faltou', classe: 'badge-danger' },
  cancelada: { texto: 'Cancelada', classe: '' },
};

export function StatusConsulta({ status }: { status: StatusConsulta }) {
  const { texto, classe } = CONSULTA[status];
  return <span className={`badge ${classe}`}>{texto}</span>;
}

const USUARIO: Record<Usuario['status'], { texto: string; classe: string }> = {
  ativo: { texto: 'Ativo', classe: 'badge-ok' },
  bloqueado: { texto: 'Bloqueado', classe: 'badge-danger' },
  convidado: { texto: 'Convite pendente', classe: 'badge-warn' },
};

export function StatusUsuario({ status }: { status: Usuario['status'] }) {
  const { texto, classe } = USUARIO[status];
  return <span className={`badge ${classe}`}>{texto}</span>;
}
