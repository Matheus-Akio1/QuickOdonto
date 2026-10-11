import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import type { Consulta, StatusConsulta } from '../../api/types';
import { NOME_PAINEL, podeAgendar, podeVerProntuario } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { ErroCarga } from '../../components/Feedback';
import {
  IconeCheck,
  IconeMais,
  IconeRaio,
  IconeReagendar,
  IconeRelogio,
  IconeSetaDireita,
  IconeWhatsapp,
} from '../../components/Icones';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { mapaDeAcentos, type Acento } from '../../lib/acentos';
import { fmtDecorrido, fmtDiaExtenso, fmtHora, hoje, isoLocal, somarDias } from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { BarraAgenda } from './BarraAgenda';
import { ConsultaDrawer } from './ConsultaDrawer';
import { NovaConsultaModal } from './NovaConsultaModal';
import { PROXIMO } from './fluxo';
import { useMudarStatus } from './useMudarStatus';

type StatusMovel = Exclude<StatusConsulta, 'agendada' | 'cancelada'>;
type Coluna = 'agendada' | 'confirmada' | 'chegou' | 'em_atendimento' | 'encerradas';

const COLUNAS: { id: Coluna; titulo: string; ponto: string }[] = [
  { id: 'agendada', titulo: 'Agendada', ponto: '#7A8683' },
  { id: 'confirmada', titulo: 'Confirmada', ponto: '#2F6FD0' },
  { id: 'chegou', titulo: 'Chegou', ponto: '#DE6B2F' },
  { id: 'em_atendimento', titulo: 'Em atendimento', ponto: '#2F6FD0' },
  { id: 'encerradas', titulo: 'Encerradas', ponto: '#067647' },
];
/** O que acontece ao soltar um cartão em cada coluna. */
const ALVO: Partial<Record<Coluna, StatusMovel>> = {
  confirmada: 'confirmada',
  chegou: 'chegou',
  em_atendimento: 'em_atendimento',
  encerradas: 'concluida',
};
const DICA: Partial<Record<Coluna, string>> = {
  confirmada: 'Solte aqui para confirmar',
  chegou: 'Solte aqui para marcar chegada',
  em_atendimento: 'Solte aqui para chamar para a cadeira',
  encerradas: 'Solte aqui para finalizar',
};
const ENCERRADAS: { status: StatusConsulta; titulo: string; ponto: string }[] = [
  { status: 'concluida', titulo: 'Finalizada', ponto: '#067647' },
  { status: 'faltou', titulo: 'Faltou', ponto: '#B42318' },
  { status: 'cancelada', titulo: 'Cancelada', ponto: '#7A8683' },
];
const colunaDe = (s: StatusConsulta): Coluna =>
  s === 'concluida' || s === 'faltou' || s === 'cancelada' ? 'encerradas' : s;

export function QuadroPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const navegar = useNavigate();
  const edita = usuario ? podeAgendar(usuario.perfil) : false;
  const verProntuario = usuario ? podeVerProntuario(usuario.perfil) : false;
  const [dia, setDia] = useState(hoje());
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState<Consulta | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ pacienteId?: string } | null>(null);
  const [buscaPac, setBuscaPac] = useState('');
  const mudar = useMudarStatus();

  const inicio = isoLocal(dia, '00:00');
  const fim = isoLocal(somarDias(dia, 1), '00:00');
  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const lista = useMemo(() => profs.data ?? [], [profs.data]);
  const acentos = useMemo(() => mapaDeAcentos(lista), [lista]);
  const selecionados = useMemo(
    () => new Set(lista.filter((p) => !fora.has(p.id)).map((p) => p.id)),
    [lista, fora],
  );
  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim],
    queryFn: () => chamar(api.GET('/consultas', { params: { query: { inicio, fim } } })),
  });

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const todas = consultas.data ?? [];
  const visiveis = todas.filter((c) => selecionados.has(c.profissional.id));
  const contagem = todas.reduce<Record<string, number>>((acc, c) => {
    acc[c.profissional.id] = (acc[c.profissional.id] ?? 0) + 1;
    return acc;
  }, {});
  // Coluna para onde o cartão em arrasto pode ir (só a etapa seguinte).
  const destino = arrastando ? PROXIMO[arrastando.status] : undefined;

  const aoSoltar = (e: DragEndEvent) => {
    setArrastando(null);
    const col = e.over?.id as Coluna | undefined;
    const c = todas.find((x) => x.id === e.active.id);
    if (!col || !c || col === colunaDe(c.status)) return;
    const alvo = ALVO[col];
    if (!alvo) {
      avisar('Uma consulta não volta para “Agendada”.', 'erro');
      return;
    }
    mudar.mutate({ id: c.id, status: alvo });
  };
  const aoComecar = (e: DragStartEvent) =>
    setArrastando(todas.find((x) => x.id === e.active.id) ?? null);
  const alternar = (id: string) =>
    setFora((atual) => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!usuario) return null;

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[usuario.perfil]} / Agenda`} titulo="Quadro do dia">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (buscaPac.trim()) navegar('/pacientes', { state: { busca: buscaPac.trim() } });
          }}
        >
          <BuscaCabecalho
            valor={buscaPac}
            onMudar={setBuscaPac}
            placeholder="Buscar paciente"
            largura={280}
          />
        </form>
        {edita && lista.length > 0 && (
          <button type="button" className="btn pri" onClick={() => setNovo({})}>
            <IconeMais />
            Nova consulta
          </button>
        )}
      </Cabecalho>

      <div className="content" style={{ gap: 14 }}>
        <BarraAgenda
          visao="quadro"
          titulo={fmtDiaExtenso(dia)}
          onHoje={() => setDia(hoje())}
          onMover={(d) => setDia(somarDias(dia, d))}
          profissionais={lista}
          acentos={acentos}
          selecionados={selecionados}
          onAlternar={alternar}
          contagem={contagem}
        />
        {consultas.error && (
          <ErroCarga erro={consultas.error} onTentar={() => consultas.refetch()} />
        )}

        <DndContext
          sensors={sensores}
          onDragStart={aoComecar}
          onDragEnd={aoSoltar}
          onDragCancel={() => setArrastando(null)}
        >
          <div className="quadro" aria-busy={consultas.isFetching}>
            {COLUNAS.map((col) => {
              const itens = visiveis.filter((c) => colunaDe(c.status) === col.id);
              const ehDestino = Boolean(destino && colunaDe(destino) === col.id);
              return (
                <ColunaQuadro
                  key={col.id}
                  coluna={col}
                  total={itens.length}
                  edita={edita}
                  mostrarDica={ehDestino}
                >
                  {col.id === 'encerradas'
                    ? ENCERRADAS.map((g) => {
                        const doGrupo = itens.filter((c) => c.status === g.status);
                        if (!doGrupo.length) return null;
                        return (
                          <div key={g.status} className="stack" style={{ gap: 8 }}>
                            <div className="q-cab" style={{ fontSize: 13, padding: '2px 4px 0' }}>
                              <span className="ponto" style={{ background: g.ponto }} />
                              {g.titulo}
                              <span className="n">{doGrupo.length}</span>
                            </div>
                            {doGrupo.map((c) => (
                              <Cartao
                                key={c.id}
                                c={c}
                                acento={acentos[c.profissional.id]}
                                edita={false}
                                onAbrir={setAberta}
                                onReagendar={(id) => setNovo({ pacienteId: id })}
                                podeReagendar={edita}
                              />
                            ))}
                          </div>
                        );
                      })
                    : itens.map((c) => (
                        <CartaoArrastavel
                          verProntuario={verProntuario}
                          key={c.id}
                          c={c}
                          acento={acentos[c.profissional.id]}
                          edita={edita}
                          onAbrir={setAberta}
                          onMudar={(id, s) => mudar.mutate({ id, status: s })}
                        />
                      ))}
                </ColunaQuadro>
              );
            })}
          </div>
          <DragOverlay>
            {arrastando ? (
              <Cartao
                c={arrastando}
                acento={acentos[arrastando.profissional.id]}
                edita={false}
                flutuante
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {aberta && (
        <ConsultaDrawer
          id={aberta}
          podeEditar={edita}
          profissionais={lista}
          onFechar={() => setAberta(null)}
        />
      )}
      {novo && (
        <NovaConsultaModal
          profissionais={lista}
          pacienteId={novo.pacienteId}
          data={dia < hoje() ? hoje() : dia}
          onFechar={() => setNovo(null)}
        />
      )}
    </>
  );
}

function ColunaQuadro({
  coluna,
  total,
  edita,
  mostrarDica,
  children,
}: {
  coluna: (typeof COLUNAS)[number];
  total: number;
  edita: boolean;
  mostrarDica: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id, disabled: !edita });
  return (
    <section
      ref={setNodeRef}
      className={`q-col ${coluna.id} ${isOver && mostrarDica ? 'alvo' : ''}`}
      aria-label={coluna.titulo}
    >
      <div className="q-cab">
        <span className="ponto" style={{ background: coluna.ponto }} />
        {coluna.titulo}
        <span
          className="n"
          style={{
            background: '#fff',
            borderRadius: 999,
            padding: '1px 9px',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-2)',
          }}
        >
          {total}
        </span>
      </div>
      {children}
      {mostrarDica && <div className="q-solte">{DICA[coluna.id]}</div>}
    </section>
  );
}

interface CartaoProps {
  c: Consulta;
  acento?: Acento;
  edita: boolean;
  flutuante?: boolean;
  verProntuario?: boolean;
  podeReagendar?: boolean;
  onAbrir?: (id: string) => void;
  onMudar?: (id: string, status: StatusMovel) => void;
  onReagendar?: (pacienteId: string) => void;
}

function CartaoArrastavel(props: CartaoProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.c.id,
    disabled: !props.edita,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="group"
      aria-roledescription="cartão arrastável"
      style={{ touchAction: 'none', opacity: isDragging ? 0.4 : 1 }}
    >
      <Cartao {...props} />
    </div>
  );
}

function Cartao({
  c,
  acento,
  edita,
  flutuante,
  verProntuario,
  podeReagendar,
  onAbrir,
  onMudar,
  onReagendar,
}: CartaoProps) {
  const parar = (e: React.PointerEvent) => e.stopPropagation();
  const acao = {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    gap: 6,
    alignItems: 'center',
  } as const;
  return (
    <article className={`q-card ${flutuante ? 'flutuante' : ''}`}>
      <div className="hora">
        <IconeRelogio tamanho={14} />
        <span style={{ fontSize: 13 }}>{fmtHora(c.inicio)}</span>
        <span className="q-prof" style={{ background: acento?.fundo, color: acento?.texto }}>
          {c.profissional.nome}
        </span>
      </div>
      {flutuante || !onAbrir ? (
        <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{c.paciente.nome}</span>
      ) : (
        <button
          type="button"
          className="q-nome"
          onPointerDown={parar}
          onClick={() => onAbrir(c.id)}
          aria-label={`Detalhes da consulta de ${c.paciente.nome}`}
        >
          {c.paciente.nome}
        </button>
      )}
      <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {c.procedimento_previsto ?? 'Consulta'}
      </span>

      {c.status === 'chegou' && c.status_desde && (
        <span className="badge b-warn" style={{ alignSelf: 'flex-start' }}>
          <IconeRelogio tamanho={13} />
          Aguardando há {fmtDecorrido(c.status_desde)}
        </span>
      )}
      {c.status === 'em_atendimento' && c.status_desde && (
        <span className="badge b-info" style={{ alignSelf: 'flex-start' }}>
          <span className="pulse" />
          Na cadeira · {fmtDecorrido(c.status_desde)}
        </span>
      )}
      {c.status === 'cancelada' && c.motivo_cancelamento && (
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Motivo: {c.motivo_cancelamento}</span>
      )}
      {c.status === 'faltou' && podeReagendar && (
        <button
          type="button"
          className="link-acao"
          style={{ ...acao, color: 'var(--primary)' }}
          onClick={() => onReagendar?.(c.paciente.id)}
        >
          <IconeReagendar tamanho={14} />
          Reagendar
        </button>
      )}

      {edita && !flutuante && (
        <div onPointerDown={parar}>
          {c.status === 'agendada' && (
            <button type="button" className="btn xs" onClick={() => onMudar?.(c.id, 'confirmada')}>
              <IconeWhatsapp tamanho={14} />
              Confirmar
            </button>
          )}
          {c.status === 'confirmada' && (
            <button type="button" className="btn xs sec" onClick={() => onMudar?.(c.id, 'chegou')}>
              <IconeCheck tamanho={14} />
              Marcar chegada
            </button>
          )}
          {c.status === 'chegou' && (
            <button
              type="button"
              className="btn xs pri"
              style={{ width: '100%' }}
              onClick={() => onMudar?.(c.id, 'em_atendimento')}
            >
              <IconeRaio tamanho={14} />
              Chamar para a cadeira
            </button>
          )}
          {c.status === 'em_atendimento' && (
            <button type="button" className="btn xs" onClick={() => onMudar?.(c.id, 'concluida')}>
              <IconeCheck tamanho={14} />
              Finalizar
            </button>
          )}
        </div>
      )}
      {verProntuario && !flutuante && c.status === 'em_atendimento' && (
        <Link
          to={`/clinica/prontuario/${c.paciente.id}`}
          className="link-acao"
          style={{ ...acao, gap: 4, color: 'var(--ink-2)' }}
        >
          Abrir prontuário
          <IconeSetaDireita tamanho={14} />
        </Link>
      )}
    </article>
  );
}
