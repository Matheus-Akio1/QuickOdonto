import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Face, PlanoTratamento } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { fmtDataHora } from '../../lib/datas';
import { fmtMoeda } from '../../lib/moeda';
import { ARCADAS, facesDoDente } from '../../lib/odonto';
import { useToast } from '../../toast/useToast';
import { chave, CLINICO, useCatalogo, useInvalidarProntuario } from './useProntuario';

const DENTES = [
  ...ARCADAS.permanente.superior,
  ...ARCADAS.permanente.inferior,
  ...ARCADAS.deciduo.superior,
  ...ARCADAS.deciduo.inferior,
]
  .slice()
  .sort((a, b) => a - b);

export function PlanosTab({ pacienteId }: { pacienteId: string }) {
  const [novo, setNovo] = useState(false);
  const planos = useQuery({
    queryKey: chave(pacienteId, 'planos'),
    queryFn: () =>
      chamar(api.GET('/planos-tratamento', { params: { query: { paciente_id: pacienteId } } })),
    ...CLINICO,
  });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted">
          Ao aprovar, cada item entra no prontuário como procedimento planejado.
        </p>
        <Button onClick={() => setNovo(true)}>Novo plano</Button>
      </div>
      {planos.error ? (
        <ErroCarga erro={planos.error} onTentar={() => planos.refetch()} />
      ) : !planos.data ? (
        <Carregando />
      ) : !planos.data.length ? (
        <div className="card">
          <Vazio titulo="Nenhum plano de tratamento" />
        </div>
      ) : (
        planos.data.map((p) => <CartaoPlano key={p.id} plano={p} pacienteId={pacienteId} />)
      )}
      {novo && <NovoPlano pacienteId={pacienteId} onFechar={() => setNovo(false)} />}
    </div>
  );
}

function CartaoPlano({ plano, pacienteId }: { plano: PlanoTratamento; pacienteId: string }) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  const [confirmar, setConfirmar] = useState(false);
  const aprovar = useMutation({
    mutationFn: () =>
      chamar(api.POST('/planos-tratamento/{id}/aprovar', { params: { path: { id: plano.id } } })),
    onSuccess: () => {
      setConfirmar(false);
      invalidar();
      avisar('Plano aprovado. Os procedimentos foram lançados como planejados.', 'ok');
    },
    onError: (e) => {
      setConfirmar(false);
      avisar(mensagemDeErro(e), 'erro');
    },
  });

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Plano de {fmtDataHora(plano.criado_em)}</h2>
          <p className="muted">
            {plano.profissional_nome ?? plano.criado_por_nome}
            {plano.aprovado_em
              ? ` · aprovado em ${fmtDataHora(plano.aprovado_em)} por ${plano.aprovado_por_nome}`
              : ''}
          </p>
        </div>
        <span className={`badge ${plano.status === 'aprovado' ? 'badge-ok' : 'badge-warn'}`}>
          {plano.status === 'aprovado' ? 'Aprovado' : 'Rascunho'}
        </span>
      </div>
      {plano.observacao && (
        <p style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{plano.observacao}</p>
      )}
      <div className="table-wrap">
        <table className="table empilha">
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Dente / faces</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {plano.itens.map((i) => (
              <tr key={i.id}>
                <td data-rotulo="Procedimento">{i.catalogo.nome}</td>
                <td data-rotulo="Dente / faces">
                  {i.dente
                    ? `${i.dente}${i.faces.length ? ` (${i.faces.join('')})` : ''}`
                    : 'Geral'}
                </td>
                <td data-rotulo="Valor" className="mono" style={{ textAlign: 'right' }}>
                  {fmtMoeda(i.valor)}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}>
                <strong>Total</strong>
              </td>
              <td data-rotulo="Total" className="mono" style={{ textAlign: 'right' }}>
                <strong>{fmtMoeda(plano.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {plano.status === 'rascunho' && (
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => setConfirmar(true)}>Aprovar orçamento</Button>
        </div>
      )}
      {confirmar && (
        <ConfirmDialog
          titulo="Aprovar orçamento?"
          confirmar="Aprovar"
          carregando={aprovar.isPending}
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => aprovar.mutate()}
        >
          <p>
            O plano de {fmtMoeda(plano.total)} será congelado e seus {plano.itens.length} itens
            entrarão no prontuário como procedimentos planejados. Não é possível desfazer.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

interface ItemForm {
  catalogo_id: string;
  dente: string;
  faces: Face[];
  valor: string;
}
const itemVazio = (): ItemForm => ({ catalogo_id: '', dente: '', faces: [], valor: '' });

function NovoPlano({ pacienteId, onFechar }: { pacienteId: string; onFechar: () => void }) {
  const { avisar } = useToast();
  const invalidar = useInvalidarProntuario(pacienteId);
  const catalogo = useCatalogo();
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()]);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const porId = Object.fromEntries((catalogo.data ?? []).map((c) => [c.id, c]));
  const valorDe = (i: ItemForm) =>
    i.valor !== '' ? Number(i.valor.replace(',', '.')) : (porId[i.catalogo_id]?.valor_padrao ?? 0);
  const total = itens.filter((i) => i.catalogo_id).reduce((a, i) => a + valorDe(i), 0);
  const mudar = (n: number, parcial: Partial<ItemForm>) =>
    setItens((l) => l.map((x, i) => (i === n ? { ...x, ...parcial } : x)));

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/planos-tratamento', {
          body: {
            paciente_id: pacienteId,
            observacao: observacao.trim() || null,
            itens: itens
              .filter((i) => i.catalogo_id)
              .map((i) => ({
                catalogo_id: i.catalogo_id,
                dente: i.dente ? Number(i.dente) : null,
                faces: i.dente ? i.faces : [],
                valor: i.valor !== '' ? Number(i.valor.replace(',', '.')) : null,
              })),
          },
        }),
      ),
    onSuccess: () => {
      invalidar();
      avisar('Plano criado como rascunho.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo="Novo plano de tratamento"
      descricao="O total é recalculado pelo servidor."
      onFechar={onFechar}
      largo
      rodape={
        <>
          <span className="mono" style={{ marginRight: 'auto', fontWeight: 700 }}>
            Total {fmtMoeda(total)}
          </span>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={!itens.some((i) => i.catalogo_id)}
            carregando={salvar.isPending}
            onClick={() => {
              setErro(null);
              salvar.mutate();
            }}
          >
            Salvar rascunho
          </Button>
        </>
      }
    >
      <div className="stack">
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        {itens.map((it, n) => (
          <fieldset key={n} className="card" style={{ padding: 12 }}>
            <legend className="label">Item {n + 1}</legend>
            <div className="form-grid">
              <label className="field full">
                <span className="label">Procedimento</span>
                <select
                  className="select"
                  value={it.catalogo_id}
                  onChange={(e) => mudar(n, { catalogo_id: e.target.value, valor: '' })}
                >
                  <option value="">Selecione…</option>
                  {catalogo.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nome} ({fmtMoeda(c.valor_padrao)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Dente</span>
                <select
                  className="select"
                  value={it.dente}
                  onChange={(e) => mudar(n, { dente: e.target.value, faces: [] })}
                >
                  <option value="">Geral (sem dente)</option>
                  {DENTES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Valor (R$)</span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder={
                    porId[it.catalogo_id]
                      ? String(porId[it.catalogo_id].valor_padrao).replace('.', ',')
                      : ''
                  }
                  value={it.valor}
                  onChange={(e) => mudar(n, { valor: e.target.value.replace(/[^\d,.]/g, '') })}
                />
              </label>
            </div>
            {it.dente && (
              <div
                className="faces-check"
                style={{ marginTop: 8 }}
                role="group"
                aria-label={`Faces do item ${n + 1}`}
              >
                {facesDoDente(Number(it.dente)).map((f) => (
                  <label key={f} className="check" style={{ minHeight: 36 }}>
                    <input
                      type="checkbox"
                      checked={it.faces.includes(f)}
                      onChange={() =>
                        mudar(n, {
                          faces: it.faces.includes(f)
                            ? it.faces.filter((x) => x !== f)
                            : [...it.faces, f],
                        })
                      }
                    />
                    {f}
                  </label>
                ))}
              </div>
            )}
            {itens.length > 1 && (
              <Button
                variante="ghost"
                pequeno
                style={{ marginTop: 6 }}
                onClick={() => setItens((l) => l.filter((_, i) => i !== n))}
              >
                Remover item
              </Button>
            )}
          </fieldset>
        ))}
        <div>
          <Button variante="secondary" pequeno onClick={() => setItens((l) => [...l, itemVazio()])}>
            + Adicionar item
          </Button>
        </div>
        <label className="field">
          <span className="label">Observação</span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={2000}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </label>
      </div>
    </Overlay>
  );
}
