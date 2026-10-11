import { useMutation } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Face, ProcedimentoPaciente, StatusProcedimento } from '../../api/types';
import { Chip } from '../../components/Chip';
import { IconeMais } from '../../components/Icones';
import { Seg } from '../../components/Seg';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { fmtDataBR } from '../../lib/datas';
import { fmtMoeda } from '../../lib/moeda';
import { TEXTO_STATUS_PROC } from '../../lib/status';
import { facesDoDente, NOME_FACE, nomeDoDente } from '../../lib/odonto';
import { useToast } from '../../toast/useToast';
import { Odontograma } from './Odontograma';
import { estadoPorDente } from './odontogramaEstado';
import { useCatalogo, useInvalidarProntuario, useProcedimentos } from './useProntuario';

const CLASSE_STATUS: Record<StatusProcedimento, string> = {
  planejado: 'b-mut',
  em_andamento: 'b-info',
  concluido: 'b-ok',
  cancelado: 'b-mut',
};

export function OdontogramaTab({
  pacienteId,
  dente,
  onDente,
}: {
  pacienteId: string;
  dente: number | null;
  onDente: (d: number | null) => void;
}) {
  const procs = useProcedimentos(pacienteId);
  // A dentição acompanha o dente que veio selecionado do Resumo.
  const [denticao, setDenticao] = useState<'permanente' | 'deciduo'>(
    dente && dente > 50 ? 'deciduo' : 'permanente',
  );
  const [geral, setGeral] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const irAoPainel = () =>
    requestAnimationFrame(() =>
      painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  const estados = useMemo(() => estadoPorDente(procs.data ?? []), [procs.data]);

  if (procs.error) return <ErroCarga erro={procs.error} onTentar={() => procs.refetch()} />;
  if (!procs.data) return <Carregando />;

  const gerais = procs.data.filter((p) => !p.dente);
  const alvo = geral ? null : dente;
  const historico = geral ? gerais : dente ? (estados[dente]?.procedimentos ?? []) : [];

  return (
    <>
      <Odontograma
        estados={estados}
        denticao={denticao}
        selecionado={geral ? null : dente}
        onSelecionar={(n) => {
          setGeral(false);
          onDente(n);
        }}
        controle={
          <Seg
            pequeno
            rotulo="Dentição"
            valor={denticao}
            onMudar={(v) => {
              setDenticao(v);
              onDente(null);
            }}
            opcoes={[
              { valor: 'permanente', rotulo: 'Permanente' },
              { valor: 'deciduo', rotulo: 'Decídua' },
            ]}
          />
        }
        acoes={() => (
          <button type="button" className="btn sec sm" onClick={irAoPainel}>
            <IconeMais />
            Registrar procedimento
          </button>
        )}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -6 }}>
        Vista do dentista, de frente para o paciente: o lado direito do paciente fica à esquerda.
      </p>

      <div ref={painel} className="odonto-grade" style={{ scrollMarginTop: 16 }}>
        <section className="card pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 className="h2">
              {geral ? 'Procedimentos gerais' : dente ? `Histórico do dente ${dente}` : 'Histórico'}
            </h2>
            <span style={{ flexGrow: 1 }} />
            <Chip ativo={geral} onClick={() => setGeral((g) => !g)}>
              Sem dente ({gerais.length})
            </Chip>
          </div>
          {!geral && !dente ? (
            <p className="muted">Selecione um dente para ver o histórico.</p>
          ) : historico.length === 0 ? (
            <p className="muted">
              {geral ? 'Nenhum procedimento geral.' : 'Nenhum procedimento neste dente.'}
            </p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
              {historico.map((p) => (
                <ItemProcedimento key={p.id} p={p} pacienteId={pacienteId} />
              ))}
            </ul>
          )}
        </section>

        <section className="card pad" aria-live="polite">
          {!geral && !dente ? (
            <p className="muted">
              Selecione um dente — ou “Sem dente” para um procedimento geral — e registre aqui.
            </p>
          ) : (
            <PainelDente key={alvo ?? 'geral'} pacienteId={pacienteId} dente={alvo} />
          )}
        </section>
      </div>
    </>
  );
}

function PainelDente({ pacienteId, dente }: { pacienteId: string; dente: number | null }) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  const catalogo = useCatalogo();
  const [catalogoId, setCatalogoId] = useState('');
  const [faces, setFaces] = useState<Face[]>([]);
  const [status, setStatus] = useState<'planejado' | 'em_andamento' | 'concluido'>('planejado');
  const [observacao, setObservacao] = useState('');
  const [valor, setValor] = useState('');

  const alternar = (f: Face) =>
    setFaces((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
  const item = catalogo.data?.find((c) => c.id === catalogoId);

  const registrar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/pacientes/{id}/procedimentos', {
          params: { path: { id: pacienteId } },
          body: {
            catalogo_id: catalogoId,
            dente,
            faces,
            status,
            valor: valor === '' ? null : Number(valor.replace(',', '.')),
            observacao: observacao.trim() || null,
          },
        }),
      ),
    onSuccess: () => {
      setCatalogoId('');
      setFaces([]);
      setObservacao('');
      setValor('');
      setStatus('planejado');
      invalidar();
      avisar('Procedimento registrado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  return (
    <div className="stack">
      <h2 className="h2">Registrar procedimento</h2>
      <span style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: -8 }}>
        {dente ? `Dente ${dente} · ${nomeDoDente(dente)}` : 'Procedimento geral (sem dente)'}
      </span>
      {dente !== null && (
        <div className="field">
          <span className="label" id="rotulo-faces">
            Faces
          </span>
          <div style={{ display: 'flex', gap: 6 }} role="group" aria-labelledby="rotulo-faces">
            {facesDoDente(dente).map((f) => (
              <button
                key={f}
                type="button"
                className={`face-btn ${faces.includes(f) ? 'on' : ''}`}
                aria-pressed={faces.includes(f)}
                aria-label={NOME_FACE[f]}
                title={NOME_FACE[f]}
                onClick={() => alternar(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
      <Campo label="Procedimento">
        {(p) => (
          <select
            {...p}
            className="select"
            value={catalogoId}
            onChange={(e) => {
              setCatalogoId(e.target.value);
              setValor('');
            }}
          >
            <option value="">Selecione…</option>
            {catalogo.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nome}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1', alignItems: 'flex-start' }}>
          <span className="label" id="rotulo-situacao">
            Situação
          </span>
          <Seg
            rotulo="Situação"
            valor={status}
            onMudar={setStatus}
            opcoes={[
              { valor: 'planejado', rotulo: 'Planejado' },
              { valor: 'em_andamento', rotulo: 'Em andamento' },
              { valor: 'concluido', rotulo: 'Concluído' },
            ]}
          />
        </div>
        <Campo
          label="Valor (R$)"
          dica={item ? `Padrão do catálogo: ${fmtMoeda(item.valor_padrao)}` : undefined}
        >
          {(p) => (
            <input
              {...p}
              className="input"
              inputMode="decimal"
              placeholder={item ? String(item.valor_padrao).replace('.', ',') : ''}
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ''))}
            />
          )}
        </Campo>
      </div>
      <Campo label="Observação" dica="Armazenada cifrada.">
        {(p) => (
          <textarea
            {...p}
            className="textarea"
            rows={2}
            maxLength={2000}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        )}
      </Campo>
      <div>
        <Button
          disabled={!catalogoId}
          carregando={registrar.isPending}
          onClick={() => registrar.mutate()}
        >
          Registrar
        </Button>
      </div>
    </div>
  );
}

const PROXIMO: Partial<Record<StatusProcedimento, StatusProcedimento>> = {
  planejado: 'em_andamento',
  em_andamento: 'concluido',
};

function ItemProcedimento({ p, pacienteId }: { p: ProcedimentoPaciente; pacienteId: string }) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  const [adendo, setAdendo] = useState<string | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const fechado = p.status === 'concluido' || p.status === 'cancelado';

  const mudar = useMutation({
    mutationFn: (body: { status?: StatusProcedimento; adendo?: string }) =>
      chamar(api.PATCH('/procedimentos-paciente/{id}', { params: { path: { id: p.id } }, body })),
    onSuccess: (_r, body) => {
      if (body.adendo) setAdendo(null);
      invalidar();
      avisar(body.adendo ? 'Adendo registrado.' : 'Procedimento atualizado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
  const proximo = PROXIMO[p.status];

  return (
    <li className="evolucao" style={{ padding: '10px 12px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{p.catalogo.nome}</strong>
        <span className={`badge ${CLASSE_STATUS[p.status]}`}>{TEXTO_STATUS_PROC[p.status]}</span>
      </div>
      <p className="muted">
        {p.faces.length ? `Faces ${p.faces.join(', ')} · ` : ''}
        {p.data ? fmtDataBR(p.data) : 'Sem data'} · {fmtMoeda(p.valor)}
        {p.profissional_nome ? ` · ${p.profissional_nome}` : ''}
      </p>
      {p.observacao && <p className="texto">{p.observacao}</p>}
      {p.adendos.map((a) => (
        <div key={a.id} className="adendo">
          <strong>Adendo</strong> · {a.autor ?? ''}
          <p className="texto">{a.conteudo}</p>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        {proximo && (
          <Button
            pequeno
            carregando={mudar.isPending}
            onClick={() => mudar.mutate({ status: proximo })}
          >
            {proximo === 'concluido' ? 'Concluir' : 'Iniciar'}
          </Button>
        )}
        {!fechado && (
          <Button variante="secondary" pequeno onClick={() => setConfirmarCancelamento(true)}>
            Cancelar
          </Button>
        )}
        {adendo === null && (
          <Button variante="ghost" pequeno onClick={() => setAdendo('')}>
            Adendo
          </Button>
        )}
      </div>
      {confirmarCancelamento && (
        <ConfirmDialog
          titulo="Cancelar procedimento?"
          confirmar="Cancelar procedimento"
          perigo
          carregando={mudar.isPending}
          onCancelar={() => setConfirmarCancelamento(false)}
          onConfirmar={() =>
            mudar.mutate(
              { status: 'cancelado' },
              { onSettled: () => setConfirmarCancelamento(false) },
            )
          }
        >
          <p>
            {p.catalogo.nome}
            {p.dente ? ` no dente ${p.dente}` : ''} ficará como <strong>cancelado</strong>. Não é
            possível reabrir — correções posteriores só por adendo (RN-006).
          </p>
        </ConfirmDialog>
      )}
      {adendo !== null && (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          <label className="sr-only" htmlFor={`adendo-proc-${p.id}`}>
            Adendo
          </label>
          <textarea
            id={`adendo-proc-${p.id}`}
            className="textarea"
            rows={2}
            maxLength={2000}
            placeholder={
              fechado ? 'Procedimento fechado: correções entram como adendo.' : 'Complemento'
            }
            value={adendo}
            onChange={(e) => setAdendo(e.target.value)}
          />
          <div className="row">
            <Button
              pequeno
              disabled={adendo.trim().length < 3}
              onClick={() => mudar.mutate({ adendo: adendo.trim() })}
            >
              Salvar adendo
            </Button>
            <Button variante="secondary" pequeno onClick={() => setAdendo(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
