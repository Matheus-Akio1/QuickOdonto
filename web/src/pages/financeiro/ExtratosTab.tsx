import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { IconeBaixar, IconeSetaDireita, IconeSetaEsquerda } from '../../components/Icones';
import { fmtDataBR, fmtDataCurta, hoje } from '../../lib/datas';
import { mesDe, moverPeriodo, periodoDe } from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';

/** Extrato mensal de serviços por cliente (prancha "Adm. Laboratório · extrato do cliente"). */
export function ExtratosTab() {
  const { avisar } = useToast();
  const [cliente, setCliente] = useState('');
  const [ancora, setAncora] = useState(hoje());
  const mes = mesDe(ancora);

  const clientes = useQuery({
    queryKey: ['lab-clientes', 'lista'],
    queryFn: () => chamar(api.GET('/laboratorio/clientes')),
  });
  const escolhido = cliente || clientes.data?.[0]?.id || '';
  const extrato = useQuery({
    queryKey: ['financeiro', 'extrato', escolhido, mes],
    enabled: Boolean(escolhido),
    queryFn: () =>
      chamar(
        api.GET('/financeiro/extratos/{clienteId}', {
          params: { path: { clienteId: escolhido }, query: { mes } },
        }),
      ),
  });
  // O PDF é montado no servidor; aqui só chega o link de uso único.
  const pdf = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/financeiro/extratos/{clienteId}/pdf', {
          params: { path: { clienteId: escolhido } },
          body: { mes },
        }),
      ),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  const e = extrato.data;
  return (
    <>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <select
          className="sel-chip"
          style={{ maxWidth: 320, minWidth: 220 }}
          aria-label="Cliente"
          value={escolhido}
          onChange={(ev) => setCliente(ev.target.value)}
        >
          {clientes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razao_social}
            </option>
          ))}
        </select>
        <div className="fin-mes">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => setAncora(moverPeriodo('mes', ancora, -1))}
          >
            <IconeSetaEsquerda tamanho={16} />
          </button>
          <span>{periodoDe('mes', ancora).rotulo}</span>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => setAncora(moverPeriodo('mes', ancora, 1))}
          >
            <IconeSetaDireita tamanho={16} />
          </button>
        </div>
        <Button
          style={{ marginLeft: 'auto' }}
          disabled={!e}
          carregando={pdf.isPending}
          onClick={() => pdf.mutate()}
        >
          <IconeBaixar />
          Baixar PDF
        </Button>
      </div>

      {extrato.error ? (
        <ErroCarga erro={extrato.error} onTentar={() => extrato.refetch()} />
      ) : !e ? (
        <Carregando />
      ) : (
        <>
          <div className="card pad row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <div className="stack" style={{ gap: 4, flex: '1 1 260px', minWidth: 0 }}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <h2 className="h2">{e.cliente.razao_social}</h2>
                <span className={`badge ${e.cliente.tipo === 'interno' ? 'b-own' : 'b-lab'}`}>
                  {e.cliente.tipo === 'interno' ? 'Clínica própria' : 'Cliente externo'}
                </span>
              </div>
              <span className="muted">
                {[
                  e.cliente.documento
                    ? `${e.cliente.documento_tipo === 'cpf' ? 'CPF' : 'CNPJ'} ${e.cliente.documento}`
                    : null,
                  e.cliente.responsavel,
                  e.cliente.cro,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Sem dados de cadastro'}
              </span>
            </div>
            <Resumo rotulo="Período" valor={`${fmtDataCurta(e.inicio)} a ${fmtDataBR(e.fim)}`} />
            <Resumo rotulo="OS concluídas" valor={String(e.os_concluidas)} />
            <Resumo rotulo="Total do período" valor={fmtMoeda(e.total)} destaque />
          </div>

          <div className="fin-layout">
            <div className="fin-principal">
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="fin-card-cab">
                  <h2 className="h3">Procedimentos realizados</h2>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div className="fin-grade ext cab">
                    <span className="th">Data</span>
                    <span className="th">OS</span>
                    <span className="th">Paciente</span>
                    <span className="th">Procedimento</span>
                    <span className="th">Dente</span>
                    <span className="th" style={{ justifySelf: 'end' }}>
                      Valor
                    </span>
                  </div>
                  {e.itens.map((o) => (
                    <div key={o.id} className="fin-grade ext fin-linha" style={{ minHeight: 44 }}>
                      <span className="num">{fmtDataCurta(o.data)}</span>
                      <span className="num" style={{ fontWeight: 700, fontSize: 12 }}>
                        {o.numero}
                      </span>
                      <span>{o.paciente}</span>
                      <b>{o.tipo_trabalho}</b>
                      <span className="num">
                        {o.elementos.length ? o.elementos.join(', ') : '—'}
                      </span>
                      <span className="fin-valor">
                        {o.valor == null ? 'sem preço' : fmtMoeda(o.valor)}
                      </span>
                    </div>
                  ))}
                  {!e.itens.length && <Vazio titulo="Nenhuma OS concluída neste mês" />}
                </div>
                {e.itens.length > 0 && (
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between', padding: '12px 20px' }}
                  >
                    <span className="muted">
                      {e.itens.length} {e.itens.length === 1 ? 'ordem' : 'ordens'} no período
                    </span>
                    <b className="num">Total {fmtMoeda(e.total)}</b>
                  </div>
                )}
              </div>
            </div>
            <div className="fin-lateral">
              <div className="card">
                <div className="fin-card-cab">
                  <h2 className="h3">Resumo por procedimento</h2>
                </div>
                <div className="fin-card-corpo" style={{ gap: 8 }}>
                  {e.resumo.map((r) => (
                    <div key={r.tipo_trabalho} className="fin-par">
                      <span>
                        {r.tipo_trabalho} · {r.quantidade}×
                      </span>
                      <b>{fmtMoeda(r.total)}</b>
                    </div>
                  ))}
                  {!e.resumo.length && <span className="muted">Sem procedimentos no período.</span>}
                </div>
              </div>
              <div className="card">
                <div className="fin-card-cab">
                  <h2 className="h3">Pagamento</h2>
                </div>
                <div className="fin-card-corpo" style={{ gap: 8 }}>
                  <div className="fin-par">
                    <span>Recebido</span>
                    <b>{fmtMoeda(e.pagamento.recebido)}</b>
                  </div>
                  <div className="fin-par">
                    <span>A receber</span>
                    <b>{fmtMoeda(e.pagamento.a_receber)}</b>
                  </div>
                  <div className="fin-par">
                    <span>Vencimento</span>
                    <b>{e.pagamento.vencimento ? fmtDataBR(e.pagamento.vencimento) : '—'}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Resumo({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="eyebrow">{rotulo}</span>
      <span
        className={`num ${destaque ? 'disp' : ''}`}
        style={{ fontWeight: 700, fontSize: destaque ? 24 : 15 }}
      >
        {valor}
      </span>
    </div>
  );
}
