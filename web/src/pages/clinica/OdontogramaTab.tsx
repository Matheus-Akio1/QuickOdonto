import { useMutation } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Face, ProcedimentoPaciente, StatusProcedimento } from '../../api/types';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { fmtDataBR } from '../../lib/datas';
import { fmtMoeda } from '../../lib/moeda';
import { TEXTO_STATUS_PROC } from '../../lib/status';
import { ARCADAS, facesDoDente, NOME_FACE } from '../../lib/odonto';
import { useToast } from '../../toast/useToast';
import { Dente, type EstadoFace } from './Dente';
import { estadoPorDente } from './odontogramaEstado';
import { useCatalogo, useInvalidarProntuario, useProcedimentos } from './useProntuario';

const CLASSE_STATUS: Record<StatusProcedimento, string> = {
  planejado: 'badge-info',
  em_andamento: 'badge-warn',
  concluido: 'badge-ok',
  cancelado: '',
};

export function OdontogramaTab({ pacienteId }: { pacienteId: string }) {
  const procs = useProcedimentos(pacienteId);
  const [denticao, setDenticao] = useState<'permanente' | 'deciduo'>('permanente');
  const [selecionado, setSelecionadoEstado] = useState<number | null>(null);
  const painel = useRef<HTMLElement>(null);
  // Em tela estreita o painel fica abaixo do odontograma: leva o usuário até ele.
  const setSelecionado = (n: number | null) => {
    setSelecionadoEstado(n);
    if (window.matchMedia('(max-width: 1100px)').matches) {
      requestAnimationFrame(() =>
        painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  };
  const estados = useMemo(() => estadoPorDente(procs.data ?? []), [procs.data]);

  if (procs.error) return <ErroCarga erro={procs.error} onTentar={() => procs.refetch()} />;
  if (!procs.data) return <Carregando />;

  const arcada = ARCADAS[denticao];
  const gerais = procs.data.filter((p) => !p.dente);

  const botao = (n: number) => {
    const e = estados[n];
    const resumo = e?.procedimentos
      .filter((p) => p.status !== 'cancelado')
      .map((p) => `${p.catalogo.nome} (${TEXTO_STATUS_PROC[p.status]})`);
    return (
      <button
        key={n}
        type="button"
        className="dente-btn"
        aria-pressed={selecionado === n}
        aria-label={`Dente ${n}${resumo?.length ? `: ${resumo.join('; ')}` : ', sem registros'}`}
        onClick={() => setSelecionado(n)}
      >
        <Dente numero={n} estados={e?.faces ?? {}} estadoDente={e?.inteiro} tamanho={34} />
        {n}
      </button>
    );
  };
  const linha = (dentes: readonly number[]) => {
    const meio = dentes.length / 2;
    return (
      <div className="arcada">
        {dentes.slice(0, meio).map(botao)}
        <span className="linha-media" aria-hidden="true" />
        {dentes.slice(meio).map(botao)}
      </div>
    );
  };

  return (
    <div className="odonto-layout">
      <section className="card">
        <div className="card-head">
          <h2>Odontograma</h2>
          <div className="row" role="group" aria-label="Dentição">
            <Button
              variante={denticao === 'permanente' ? 'primary' : 'secondary'}
              pequeno
              onClick={() => setDenticao('permanente')}
            >
              Permanente
            </Button>
            <Button
              variante={denticao === 'deciduo' ? 'primary' : 'secondary'}
              pequeno
              onClick={() => setDenticao('deciduo')}
            >
              Decídua
            </Button>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 8 }}>
          Vista do dentista, de frente para o paciente: o lado direito do paciente fica à esquerda.
        </p>
        <div className="odonto-wrap">
          {linha(arcada.superior)}
          {linha(arcada.inferior)}
        </div>
        <div className="legenda" style={{ marginTop: 12 }}>
          <span>
            <i style={{ background: '#cfe0f7' }} />
            Planejado
          </span>
          <span>
            <i style={{ background: '#f6d79c' }} />
            Em andamento
          </span>
          <span>
            <i style={{ background: '#b9e0c6' }} />
            Concluído
          </span>
          <span>
            <i style={{ border: '2px solid var(--ok)' }} />
            Dente inteiro
          </span>
        </div>

        <h3 style={{ marginTop: 20 }}>Procedimentos gerais (sem dente)</h3>
        {gerais.length ? (
          <ul
            className="stack"
            style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', gap: 8 }}
          >
            {gerais.map((p) => (
              <ItemProcedimento key={p.id} p={p} pacienteId={pacienteId} />
            ))}
          </ul>
        ) : (
          <p className="muted">Nenhum.</p>
        )}
        <Button
          variante="secondary"
          pequeno
          style={{ marginTop: 10 }}
          onClick={() => setSelecionado(0)}
        >
          Registrar procedimento geral
        </Button>
      </section>

      <section ref={painel} className="card" aria-live="polite" style={{ scrollMarginTop: 72 }}>
        {selecionado === null ? (
          <p className="muted">
            Selecione um dente para ver o histórico e registrar procedimentos.
          </p>
        ) : (
          <PainelDente
            key={selecionado}
            pacienteId={pacienteId}
            dente={selecionado || null}
            procedimentos={selecionado ? (estados[selecionado]?.procedimentos ?? []) : []}
            estadoFaces={selecionado ? (estados[selecionado]?.faces ?? {}) : {}}
          />
        )}
      </section>
    </div>
  );
}

function PainelDente({
  pacienteId,
  dente,
  procedimentos,
  estadoFaces,
}: {
  pacienteId: string;
  dente: number | null;
  procedimentos: ProcedimentoPaciente[];
  estadoFaces: Partial<Record<Face, EstadoFace>>;
}) {
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

  // Prévia: faces escolhidas aparecem destacadas sobre a situação atual do dente.
  const previa = { ...estadoFaces, ...Object.fromEntries(faces.map((f) => [f, 'selecionada'])) };

  return (
    <div className="stack">
      <h2>{dente ? `Dente ${dente}` : 'Procedimento geral'}</h2>
      {dente !== null && (
        <>
          {procedimentos.length === 0 ? (
            <p className="muted">Nenhum procedimento neste dente.</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
              {procedimentos.map((p) => (
                <ItemProcedimento key={p.id} p={p} pacienteId={pacienteId} />
              ))}
            </ul>
          )}
        </>
      )}

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <h3>Registrar procedimento</h3>
      {dente !== null && (
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <Dente numero={dente} estados={previa} tamanho={112} onFace={alternar} />
          <fieldset className="faces-check" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Faces (clique no desenho ou marque)
            </legend>
            {facesDoDente(dente).map((f) => (
              <label key={f} className="check" style={{ minHeight: 36 }}>
                <input type="checkbox" checked={faces.includes(f)} onChange={() => alternar(f)} />
                {f} — {NOME_FACE[f]}
              </label>
            ))}
          </fieldset>
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
        <Campo label="Situação">
          {(p) => (
            <select
              {...p}
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="planejado">Planejado</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluido">Concluído hoje</option>
            </select>
          )}
        </Campo>
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
