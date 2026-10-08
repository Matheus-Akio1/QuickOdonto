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
import { useState } from 'react';
import { api, chamar } from '../../api/client';
import type { Consulta, StatusConsulta } from '../../api/types';
import { podeAgendar } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { ErroCarga } from '../../components/Feedback';
import { textoStatusConsulta } from '../../lib/status';
import { fmtDataBR, fmtHora, hoje, isoLocal, nomeDiaLongo, somarDias } from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { CancelarDialog } from './CancelarDialog';
import { ConsultaDrawer } from './ConsultaDrawer';
import { PODE_CANCELAR, PODE_FALTAR, PROXIMO, ROTULO_ACAO } from './fluxo';
import { useMudarStatus } from './useMudarStatus';

const COLUNAS: StatusConsulta[] = [
  'agendada',
  'confirmada',
  'chegou',
  'em_atendimento',
  'concluida',
  'faltou',
];
type StatusMovel = Exclude<StatusConsulta, 'agendada' | 'cancelada'>;

export function QuadroPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const edita = usuario ? podeAgendar(usuario.perfil) : false;
  const [dia, setDia] = useState(hoje());
  const [profissional, setProfissional] = useState('');
  const [arrastando, setArrastando] = useState<Consulta | null>(null);
  const [cancelar, setCancelar] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const mudar = useMudarStatus();

  const inicio = isoLocal(dia, '00:00');
  const fim = isoLocal(somarDias(dia, 1), '00:00');
  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim, profissional],
    queryFn: () =>
      chamar(
        api.GET('/consultas', {
          params: { query: { inicio, fim, profissional: profissional || undefined } },
        }),
      ),
  });

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const todas = consultas.data ?? [];
  const canceladas = todas.filter((c) => c.status === 'cancelada').length;

  const aoSoltar = (e: DragEndEvent) => {
    setArrastando(null);
    const alvo = e.over?.id as StatusConsulta | undefined;
    const c = todas.find((x) => x.id === e.active.id);
    if (!alvo || !c || alvo === c.status) return;
    if (alvo === 'agendada' || alvo === 'cancelada') {
      avisar('Para voltar para “Agendada” ou cancelar, use os botões do cartão.', 'erro');
      return;
    }
    mudar.mutate({ id: c.id, status: alvo as StatusMovel });
  };

  const aoComecar = (e: DragStartEvent) =>
    setArrastando(todas.find((x) => x.id === e.active.id) ?? null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Quadro do dia</h1>
          <p>
            {edita
              ? 'Arraste o cartão para a próxima etapa ou use os botões.'
              : 'Visualização somente leitura.'}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div className="row">
          <Button
            variante="secondary"
            aria-label="Dia anterior"
            onClick={() => setDia(somarDias(dia, -1))}
          >
            ‹
          </Button>
          <Button variante="secondary" onClick={() => setDia(hoje())}>
            Hoje
          </Button>
          <Button
            variante="secondary"
            aria-label="Próximo dia"
            onClick={() => setDia(somarDias(dia, 1))}
          >
            ›
          </Button>
          <strong aria-live="polite">
            {nomeDiaLongo(dia)}, {fmtDataBR(dia)}
          </strong>
        </div>
        <div className="grow" />
        <label className="sr-only" htmlFor="quadro-prof">
          Profissional
        </label>
        <select
          id="quadro-prof"
          className="select"
          style={{ width: 'auto' }}
          value={profissional}
          onChange={(e) => setProfissional(e.target.value)}
        >
          <option value="">Todos os profissionais</option>
          {profs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      {consultas.error && <ErroCarga erro={consultas.error} onTentar={() => consultas.refetch()} />}
      {canceladas > 0 && (
        <p className="muted" style={{ marginBottom: 10 }}>
          {canceladas} consulta(s) cancelada(s) neste dia não aparecem no quadro.
        </p>
      )}

      <DndContext
        sensors={sensores}
        onDragStart={aoComecar}
        onDragEnd={aoSoltar}
        onDragCancel={() => setArrastando(null)}
      >
        <div className="quadro" aria-busy={consultas.isFetching}>
          {COLUNAS.map((status) => (
            <Coluna
              key={status}
              status={status}
              consultas={todas.filter((c) => c.status === status)}
              edita={edita}
              onAbrir={setAberta}
              onCancelar={setCancelar}
              onMudar={(id, s) => mudar.mutate({ id, status: s })}
            />
          ))}
        </div>
        <DragOverlay>
          {arrastando ? <Cartao c={arrastando} flutuante edita={false} /> : null}
        </DragOverlay>
      </DndContext>

      {cancelar && <CancelarDialog id={cancelar} onFechar={() => setCancelar(null)} />}
      {aberta && (
        <ConsultaDrawer
          id={aberta}
          podeEditar={edita}
          profissionais={profs.data ?? []}
          onFechar={() => setAberta(null)}
        />
      )}
    </div>
  );
}

interface ColunaProps {
  status: StatusConsulta;
  consultas: Consulta[];
  edita: boolean;
  onAbrir: (id: string) => void;
  onCancelar: (id: string) => void;
  onMudar: (id: string, status: StatusMovel) => void;
}

function Coluna({ status, consultas, edita, onAbrir, onCancelar, onMudar }: ColunaProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !edita });
  return (
    <section
      ref={setNodeRef}
      className={`quadro-col ${isOver ? 'alvo' : ''}`}
      aria-label={textoStatusConsulta(status)}
    >
      <header>
        {textoStatusConsulta(status)}
        <span className="badge">{consultas.length}</span>
      </header>
      <div className="quadro-lista">
        {consultas.map((c) => (
          <CartaoArrastavel
            key={c.id}
            c={c}
            edita={edita}
            onAbrir={onAbrir}
            onCancelar={onCancelar}
            onMudar={onMudar}
          />
        ))}
        {consultas.length === 0 && <span className="muted">Vazio</span>}
      </div>
    </section>
  );
}

function CartaoArrastavel({
  c,
  edita,
  onAbrir,
  onCancelar,
  onMudar,
}: {
  c: Consulta;
  edita: boolean;
  onAbrir: (id: string) => void;
  onCancelar: (id: string) => void;
  onMudar: (id: string, status: StatusMovel) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: c.id,
    disabled: !edita,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? 'cartao arrastando' : undefined}
      style={{ touchAction: 'none' }}
      role="group"
      aria-roledescription="cartão arrastável"
    >
      <Cartao c={c} edita={edita} onAbrir={onAbrir} onCancelar={onCancelar} onMudar={onMudar} />
    </div>
  );
}

function Cartao({
  c,
  edita,
  flutuante,
  onAbrir,
  onCancelar,
  onMudar,
}: {
  c: Consulta;
  edita: boolean;
  flutuante?: boolean;
  onAbrir?: (id: string) => void;
  onCancelar?: (id: string) => void;
  onMudar?: (id: string, status: StatusMovel) => void;
}) {
  const proximo = PROXIMO[c.status] as StatusMovel | undefined;
  return (
    <article
      className={`cartao ${flutuante ? 'cartao-flutuante' : ''}`}
      style={{ ['--cor' as string]: c.profissional.cor_agenda }}
    >
      <div className="hora">
        {fmtHora(c.inicio)} – {fmtHora(c.fim)}
      </div>
      <strong>{c.paciente.nome}</strong>
      <div className="muted">
        {c.profissional.nome} · cad. {c.cadeira}
        {c.procedimento_previsto ? ` · ${c.procedimento_previsto}` : ''}
      </div>
      {!flutuante && (
        <div className="acoes" onPointerDown={(e) => e.stopPropagation()}>
          <Button variante="ghost" pequeno onClick={() => onAbrir?.(c.id)}>
            Detalhes
          </Button>
          {edita && proximo && (
            <Button pequeno onClick={() => onMudar?.(c.id, proximo)}>
              {ROTULO_ACAO[proximo]}
            </Button>
          )}
          {edita && PODE_FALTAR.includes(c.status) && (
            <Button variante="secondary" pequeno onClick={() => onMudar?.(c.id, 'faltou')}>
              Faltou
            </Button>
          )}
          {edita && PODE_CANCELAR.includes(c.status) && (
            <Button variante="secondary" pequeno onClick={() => onCancelar?.(c.id)}>
              Cancelar
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
