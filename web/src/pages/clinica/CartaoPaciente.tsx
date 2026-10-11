import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, chamar } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { hoje, isoLocal, somarDias } from '../../lib/datas';
import { idade, prontuario5 } from '../../lib/pessoa';

interface Props {
  paciente: {
    id: string;
    nome: string;
    numero_prontuario: number;
    nascimento?: string | null;
    ativo?: boolean;
  };
  /** Ações à direita (PDF, Nova evolução…). */
  children?: ReactNode;
  /** Faixa abaixo do cabeçalho (alertas clínicos). */
  faixa?: ReactNode;
}

/** Situação do paciente na agenda de hoje — é o que acende o selo "Em atendimento". */
function useSituacaoHoje(pacienteId: string) {
  const inicio = isoLocal(hoje(), '00:00');
  const fim = isoLocal(somarDias(hoje(), 1), '00:00');
  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim],
    queryFn: () => chamar(api.GET('/consultas', { params: { query: { inicio, fim } } })),
  });
  return consultas.data?.find(
    (c) => c.paciente.id === pacienteId && (c.status === 'em_atendimento' || c.status === 'chegou'),
  )?.status;
}

/** Cartão do paciente no topo do prontuário e da anamnese (prancha "Prontuário"). */
export function CartaoPaciente({ paciente, children, faixa }: Props) {
  const situacao = useSituacaoHoje(paciente.id);
  const anos = idade(paciente.nascimento);
  return (
    <section className="card" style={{ overflow: 'hidden' }}>
      <div className="pac-topo">
        <Avatar nome={paciente.nome} tamanho={58} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 className="disp pac-nome">{paciente.nome}</h2>
            {situacao === 'em_atendimento' && (
              <span className="badge b-info" style={{ gap: 9 }}>
                <span className="pulse" />
                Em atendimento
              </span>
            )}
            {situacao === 'chegou' && <span className="badge b-warn">Na sala de espera</span>}
            {paciente.ativo === false && <span className="badge b-mut">Inativo</span>}
          </div>
          <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
            Prontuário <span className="num">{prontuario5(paciente.numero_prontuario)}</span>
            {anos !== null && ` · ${anos} anos`}
          </span>
        </div>
        {children && <div className="pac-acoes">{children}</div>}
      </div>
      {faixa}
    </section>
  );
}
