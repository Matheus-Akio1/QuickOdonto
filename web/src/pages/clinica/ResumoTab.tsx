import { useMemo } from 'react';
import type { ItemLinhaTempo, ProcedimentoPaciente } from '../../api/types';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { IconeDocumento, IconeMais } from '../../components/Icones';
import { fmtDataCurta } from '../../lib/datas';
import { fmtMoeda } from '../../lib/moeda';
import { TEXTO_STATUS_PROC } from '../../lib/status';
import { LinhaDoTempo } from './LinhaDoTempo';
import { Odontograma } from './Odontograma';
import { estadoPorDente } from './odontogramaEstado';
import { useProcedimentos } from './useProntuario';

const BADGE: Record<ProcedimentoPaciente['status'], string> = {
  planejado: 'b-mut',
  em_andamento: 'b-info',
  concluido: 'b-ok',
  cancelado: 'b-mut',
};
const ORDEM: Record<ProcedimentoPaciente['status'], number> = {
  em_andamento: 0,
  planejado: 1,
  concluido: 2,
  cancelado: 3,
};

interface Props {
  pacienteId: string;
  linha: ItemLinhaTempo[];
  dente: number | null;
  onDente: (d: number) => void;
  /** Abre outra aba do prontuário (o dente selecionado segue junto). */
  onAbrir: (aba: string) => void;
}

/** Aba "Resumo" da prancha Prontuário: odontograma, plano de tratamento e linha do tempo. */
export function ResumoTab({ pacienteId, linha, dente, onDente, onAbrir }: Props) {
  const procs = useProcedimentos(pacienteId);
  const estados = useMemo(() => estadoPorDente(procs.data ?? []), [procs.data]);

  if (procs.error) return <ErroCarga erro={procs.error} onTentar={() => procs.refetch()} />;
  if (!procs.data) return <Carregando />;

  const itens = procs.data
    .filter((p) => p.status !== 'cancelado')
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status]);
  const feitos = itens.filter((p) => p.status === 'concluido');
  const soma = (lista: ProcedimentoPaciente[]) => lista.reduce((t, p) => t + p.valor, 0);

  return (
    <>
      <Odontograma
        estados={estados}
        selecionado={dente}
        onSelecionar={onDente}
        acoes={() => (
          <>
            <button type="button" className="btn sm" onClick={() => onAbrir('odontograma')}>
              Ver histórico
            </button>
            <button type="button" className="btn sec sm" onClick={() => onAbrir('odontograma')}>
              <IconeMais />
              Registrar procedimento
            </button>
          </>
        )}
      />

      <div className="resumo-grade">
        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="plano-cab">
            <h2 className="h2">Plano de tratamento</h2>
            <span style={{ flexGrow: 1 }} />
            {itens.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                  {feitos.length} de {itens.length} concluídos
                </span>
                <div
                  className="plano-barra"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={itens.length}
                  aria-valuenow={feitos.length}
                  aria-label="Procedimentos concluídos"
                >
                  <div style={{ width: `${(feitos.length / itens.length) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="plano-linha plano-topo" aria-hidden="true">
            <span className="th">Procedimento</span>
            <span className="th">Dente</span>
            <span className="th">Profissional</span>
            <span className="th" style={{ textAlign: 'right' }}>
              Valor
            </span>
            <span className="th">Status</span>
          </div>
          {itens.length === 0 && (
            <p style={{ padding: '18px 22px', fontSize: 14, color: 'var(--ink-3)' }}>
              Nenhum procedimento registrado para este paciente.
            </p>
          )}
          {itens.map((p) => (
            <div key={p.id} className="plano-linha plano-item">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{p.catalogo.nome}</span>
                {(p.status === 'concluido' || p.adendos.length > 0) && (
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {[
                      p.status === 'concluido' && p.data
                        ? `Concluído em ${fmtDataCurta(p.data)}`
                        : null,
                      p.adendos.length
                        ? `${p.adendos.length} adendo${p.adendos.length > 1 ? 's' : ''}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>
              <span className="num" data-rotulo="Dente">
                {p.dente ? `${p.dente}${p.faces.length ? ` · ${p.faces.join('')}` : ''}` : 'Geral'}
              </span>
              <span className="muted" data-rotulo="Profissional">
                {p.profissional_nome ?? '—'}
              </span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                {fmtMoeda(p.valor)}
              </span>
              <div>
                <span className={`badge ${BADGE[p.status]}`}>{TEXTO_STATUS_PROC[p.status]}</span>
              </div>
            </div>
          ))}
          <div className="plano-pe">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="plano-rotulo">Total do plano</span>
              <span className="disp num plano-valor">{fmtMoeda(soma(itens))}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22 }}>
              <span className="plano-rotulo">Concluído</span>
              <span className="disp num plano-valor" style={{ color: '#05603A' }}>
                {fmtMoeda(soma(feitos))}
              </span>
            </div>
            <span style={{ flexGrow: 1 }} />
            <button type="button" className="btn sm" onClick={() => onAbrir('procedimentos')}>
              <IconeDocumento />
              Gerar orçamento
            </button>
            <button type="button" className="btn sec sm" onClick={() => onAbrir('odontograma')}>
              <IconeMais />
              Registrar procedimento
            </button>
          </div>
        </section>

        <LinhaDoTempo itens={linha} onAbrir={onAbrir} />
      </div>
    </>
  );
}
