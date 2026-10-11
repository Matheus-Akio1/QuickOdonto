import type { StatusConsulta, Usuario } from '../api/types';

const CONSULTA: Record<StatusConsulta, { texto: string; classe: string }> = {
  agendada: { texto: 'Aguardando confirmação', classe: 'b-mut' },
  confirmada: { texto: 'Confirmada', classe: 'b-info' },
  chegou: { texto: 'Chegou', classe: 'b-warn' },
  em_atendimento: { texto: 'Em atendimento', classe: 'b-info' },
  concluida: { texto: 'Finalizada', classe: 'b-ok' },
  faltou: { texto: 'Faltou', classe: 'b-bad' },
  cancelada: { texto: 'Cancelada', classe: 'b-mut' },
};

export function StatusConsulta({ status }: { status: StatusConsulta }) {
  const { texto, classe } = CONSULTA[status];
  return <span className={`badge ${classe}`}>{texto}</span>;
}

const USUARIO: Record<Usuario['status'], { texto: string; classe: string }> = {
  ativo: { texto: 'Ativo', classe: 'b-ok' },
  bloqueado: { texto: 'Bloqueado', classe: 'b-bad' },
  convidado: { texto: 'Convite pendente', classe: 'b-warn' },
};

export function StatusUsuario({ status }: { status: Usuario['status'] }) {
  const { texto, classe } = USUARIO[status];
  return <span className={`badge ${classe}`}>{texto}</span>;
}
