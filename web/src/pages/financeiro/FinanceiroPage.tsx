import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Lancamento } from '../../api/types';
import { NOME_PAINEL } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Abas } from '../../components/Abas';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { IconeMais, IconeSetaDireita, IconeSetaEsquerda } from '../../components/Icones';
import { Seg } from '../../components/Seg';
import { Cabecalho } from '../../layout/Cabecalho';
import { fmtDataBR, fmtDataCurta, hoje } from '../../lib/datas';
import {
  dataDoLancamento,
  detalheLancamento,
  moverPeriodo,
  periodoDe,
  seloLancamento,
  type ModoPeriodo,
  type Periodo,
} from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';
import { useCelular } from '../../lib/useCelular';
import { useToast } from '../../toast/useToast';
import { MotivoDialog } from '../os/MotivoDialog';
import { BaixaDialog } from './BaixaDialog';
import { CaixaCartao, CaixaTab } from './CaixaTab';
import { ExtratosTab } from './ExtratosTab';
import { Grafico, LegendaGrafico } from './Grafico';
import { LancamentoForm } from './LancamentoForm';
import { PrecosCartao, PrecosTab } from './PrecosTab';

const TITULO_SALDO: Record<ModoPeriodo, string> = {
  mes: 'Saldo do mês',
  semana: 'Saldo da semana',
  hoje: 'Saldo do dia',
};

type Aba = 'fluxo' | 'lancamentos' | 'caixa' | 'receber' | 'pagar' | 'precos' | 'extratos';

/** Financeiro da unidade do administrador: fluxo de caixa, títulos, caixa do dia (clínica) e extratos (laboratório). */
export function FinanceiroPage() {
  const { usuario } = useAuth();
  const celular = useCelular();
  const [aba, setAba] = useState<Aba>('fluxo');
  const [modo, setModo] = useState<ModoPeriodo>('mes');
  const [ancora, setAncora] = useState(hoje());
  const [novo, setNovo] = useState<'receita' | 'despesa' | null>(null);
  const [baixa, setBaixa] = useState<Lancamento | null>(null);

  if (!usuario) return null;
  const clinica = usuario.unidade === 'clinica';
  const periodo = periodoDe(modo, ancora);
  const abas: { id: Aba; rotulo: string }[] = clinica
    ? [
        { id: 'fluxo', rotulo: 'Fluxo de caixa' },
        { id: 'lancamentos', rotulo: 'Lançamentos' },
        { id: 'caixa', rotulo: 'Fechamento de caixa' },
      ]
    : [
        { id: 'fluxo', rotulo: 'Fluxo de caixa' },
        { id: 'receber', rotulo: 'A receber' },
        { id: 'pagar', rotulo: 'A pagar' },
        { id: 'precos', rotulo: 'Tabela de preços' },
        { id: 'extratos', rotulo: 'Extratos por cliente' },
      ];
  const modos: { valor: ModoPeriodo; rotulo: string }[] = [
    ...(clinica ? [{ valor: 'hoje' as const, rotulo: 'Hoje' }] : []),
    { valor: 'semana', rotulo: 'Semana' },
    { valor: 'mes', rotulo: 'Mês' },
  ];
  const comPeriodo = aba === 'fluxo' || aba === 'lancamentos';

  return (
    <>
      <Cabecalho
        trilha={`${NOME_PAINEL[usuario.perfil]} / Financeiro`}
        titulo={clinica || celular ? 'Financeiro' : 'Financeiro do laboratório'}
      >
        <button
          type="button"
          className="btn pri"
          aria-label="Novo lançamento"
          style={celular ? { width: 44, padding: 0 } : undefined}
          onClick={() => setNovo(aba === 'pagar' ? 'despesa' : 'receita')}
        >
          <IconeMais />
          {!celular && 'Novo lançamento'}
        </button>
      </Cabecalho>

      <div className="content">
        <div className="fin-barra">
          <Abas abas={abas} ativa={aba} onMudar={(id) => setAba(id as Aba)} />
          {comPeriodo && (
            <>
              <Seg pequeno rotulo="Período" valor={modo} onMudar={setModo} opcoes={modos} />
              <div className="fin-mes">
                <button
                  type="button"
                  aria-label="Período anterior"
                  onClick={() => setAncora(moverPeriodo(modo, ancora, -1))}
                >
                  <IconeSetaEsquerda tamanho={16} />
                </button>
                <span>{periodo.rotulo}</span>
                <button
                  type="button"
                  aria-label="Próximo período"
                  onClick={() => setAncora(moverPeriodo(modo, ancora, 1))}
                >
                  <IconeSetaDireita tamanho={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {aba === 'fluxo' && (
          <FluxoTab
            periodo={periodo}
            modo={modo}
            clinica={clinica}
            celular={celular}
            onAba={setAba}
            onBaixa={setBaixa}
          />
        )}
        {aba === 'lancamentos' && (
          <ListaTab
            titulo="Lançamentos"
            consulta={{ inicio: periodo.inicio, fim: periodo.fim }}
            vazio="Nenhum lançamento no período"
            clinica={clinica}
            onBaixa={setBaixa}
          />
        )}
        {aba === 'caixa' && <CaixaTab />}
        {aba === 'receber' && (
          <ListaTab
            titulo="Contas a receber"
            consulta={{ tipo: 'receita', situacao: 'em_aberto' }}
            vazio="Nada a receber em aberto"
            clinica={clinica}
            onBaixa={setBaixa}
          />
        )}
        {aba === 'pagar' && (
          <ListaTab
            titulo="Contas a pagar"
            consulta={{ tipo: 'despesa', situacao: 'em_aberto' }}
            vazio="Nada a pagar em aberto"
            clinica={clinica}
            onBaixa={setBaixa}
          />
        )}
        {aba === 'precos' && <PrecosTab />}
        {aba === 'extratos' && <ExtratosTab />}
      </div>

      {novo && <LancamentoForm tipoInicial={novo} onFechar={() => setNovo(null)} />}
      {baixa && <BaixaDialog lancamento={baixa} onFechar={() => setBaixa(null)} />}
    </>
  );
}

function Indicador({
  rotulo,
  valor,
  ponto,
  cor,
  children,
}: {
  rotulo: string;
  valor: number | undefined;
  ponto?: string;
  cor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card fin-ind">
      <div className="cab">
        {ponto && <i style={{ background: ponto }} />}
        <span className="eyebrow">{rotulo}</span>
      </div>
      <span className="disp num valor" style={{ color: cor }}>
        {fmtMoeda(valor)}
      </span>
      <div className="nota">{children}</div>
    </div>
  );
}

function FluxoTab({
  periodo,
  modo,
  clinica,
  celular,
  onAba,
  onBaixa,
}: {
  periodo: Periodo;
  modo: ModoPeriodo;
  clinica: boolean;
  celular: boolean;
  onAba: (a: Aba) => void;
  onBaixa: (l: Lancamento) => void;
}) {
  const { inicio, fim } = periodo;
  const fluxo = useQuery({
    queryKey: ['financeiro', 'fluxo', inicio, fim],
    queryFn: () =>
      chamar(api.GET('/financeiro/fluxo-caixa', { params: { query: { inicio, fim } } })),
  });
  const recentes = useQuery({
    queryKey: ['financeiro', 'lancamentos', { inicio, fim }],
    queryFn: () =>
      chamar(api.GET('/financeiro/lancamentos', { params: { query: { inicio, fim } } })),
  });
  const aPagar = useQuery({
    queryKey: ['financeiro', 'contas-pagar'],
    queryFn: () => chamar(api.GET('/financeiro/contas-pagar')),
  });
  const aReceber = useQuery({
    queryKey: ['financeiro', 'contas-receber', inicio, fim],
    enabled: !clinica,
    queryFn: () =>
      chamar(api.GET('/financeiro/contas-receber', { params: { query: { inicio, fim } } })),
  });

  if (fluxo.error) return <ErroCarga erro={fluxo.error} onTentar={() => fluxo.refetch()} />;
  const f = fluxo.data;
  const nomeSaldo = modo === 'mes' ? 'no mês' : modo === 'semana' ? 'na semana' : 'no dia';
  const lista = (recentes.data ?? []).slice(0, celular ? 4 : 7);

  if (celular) {
    return (
      <>
        <div className="fin-saldo-movel">
          <span className="rot">{TITULO_SALDO[modo]}</span>
          <span className="disp num valor">{fmtMoeda(f?.saldo.realizado)}</span>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              Previsto <b style={{ color: '#fff' }}>{fmtMoeda(f?.saldo.previsto)}</b>
            </span>
            <span>Realizado {nomeSaldo}</span>
          </div>
        </div>
        <div className="fin-tres">
          <Indicador rotulo="Receitas" ponto="#12A150" cor="#067647" valor={f?.receitas.realizado}>
            <span>
              a receber <b>{fmtMoeda(f?.receitas.em_aberto)}</b>
            </span>
          </Indicador>
          <Indicador rotulo="Despesas" ponto="#DE6B2F" cor="#B54708" valor={f?.despesas.realizado}>
            <span>
              a pagar <b>{fmtMoeda(f?.despesas.em_aberto)}</b>
            </span>
          </Indicador>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="row" style={{ padding: '14px 14px 10px' }}>
            <h2 className="h3">Últimos lançamentos</h2>
            <button
              type="button"
              className="link-acao"
              style={{ marginLeft: 'auto', color: 'var(--primary)' }}
              onClick={() => onAba(clinica ? 'lancamentos' : 'receber')}
            >
              Ver todos
            </button>
          </div>
          {lista.map((l) => (
            <button
              key={l.id}
              type="button"
              className="fin-movel-linha"
              disabled={l.saldo <= 0}
              onClick={() => onBaixa(l)}
            >
              <span className="fin-desc">
                <b>{l.descricao}</b>
                <small>
                  {fmtDataCurta(dataDoLancamento(l))} · {seloLancamento(l).texto.toLowerCase()}
                </small>
              </span>
              <Valor l={l} />
            </button>
          ))}
          {recentes.data && !lista.length && <Vazio titulo="Nenhum lançamento no período" />}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fin-tres">
        <Indicador rotulo="Receitas" ponto="#12A150" cor="#067647" valor={f?.receitas.realizado}>
          <span>
            A receber <b>{fmtMoeda(f?.receitas.em_aberto)}</b>
          </span>
          <span>
            Previsto <b>{fmtMoeda(f?.receitas.previsto)}</b>
          </span>
        </Indicador>
        <Indicador rotulo="Despesas" ponto="#DE6B2F" cor="#B54708" valor={f?.despesas.realizado}>
          <span>
            A pagar <b>{fmtMoeda(f?.despesas.em_aberto)}</b>
          </span>
          <span>
            Previsto <b>{fmtMoeda(f?.despesas.previsto)}</b>
          </span>
        </Indicador>
        <Indicador rotulo="Saldo" valor={f?.saldo.realizado}>
          <span>Realizado {nomeSaldo}</span>
          <span>
            Previsto <b>{fmtMoeda(f?.saldo.previsto)}</b>
          </span>
        </Indicador>
      </div>

      <div className="fin-layout">
        <div className="fin-principal">
          {!clinica && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="fin-card-cab">
                <div>
                  <h2 className="h3">A receber por cliente</h2>
                  <span className="sub">Gerado pelas OS entregues · vencimento no período</span>
                </div>
              </div>
              <div className="fin-grade cli cab">
                <span className="th">Cliente</span>
                <span className="th" style={{ justifySelf: 'end' }}>
                  Faturado
                </span>
                <span className="th" style={{ justifySelf: 'end' }}>
                  Recebido
                </span>
                <span className="th" style={{ justifySelf: 'end' }}>
                  A receber
                </span>
                <span className="th">Venc.</span>
              </div>
              {aReceber.data?.por_cliente?.map((c) => (
                <div key={c.id} className="fin-grade cli fin-linha">
                  <div className="fin-desc">
                    <b>{c.nome}</b>
                    <small>{c.tipo === 'interno' ? 'Própria' : 'Externa'}</small>
                  </div>
                  <span className="fin-valor" style={{ fontWeight: 500 }}>
                    {fmtMoeda(c.faturado)}
                  </span>
                  <span className="fin-valor" style={{ fontWeight: 500 }}>
                    {fmtMoeda(c.recebido)}
                  </span>
                  <span className="fin-valor">{fmtMoeda(c.a_receber)}</span>
                  <span className="num" style={{ fontSize: 13 }}>
                    {c.vencimento ? fmtDataCurta(c.vencimento) : '—'}
                  </span>
                </div>
              ))}
              {aReceber.data && !aReceber.data.por_cliente?.length && (
                <Vazio titulo="Nenhum título de cliente vence neste período" />
              )}
            </div>
          )}

          <div className="card">
            <div className="fin-card-cab">
              <div>
                <h2 className="h3">Receitas × despesas por semana</h2>
                <span className="sub">Em R$ mil</span>
              </div>
              <LegendaGrafico />
            </div>
            {f ? <Grafico semanas={f.semanas} /> : <Carregando linhas={3} />}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="fin-card-cab">
              <h2 className="h3">Lançamentos</h2>
              <button
                type="button"
                className="link-acao"
                style={{ marginLeft: 'auto', color: 'var(--primary)' }}
                onClick={() => onAba(clinica ? 'lancamentos' : 'receber')}
              >
                Ver todos
              </button>
            </div>
            <Linhas
              itens={lista}
              carregando={!recentes.data}
              vazio="Nenhum lançamento no período"
            />
          </div>
        </div>

        <div className="fin-lateral">
          {clinica && <CaixaCartao />}
          <div className="card">
            <div className="fin-card-cab">
              <div>
                <h2 className="h3">{clinica ? 'A pagar em breve' : 'Contas a pagar'}</h2>
                <span className="sub">Total em aberto</span>
              </div>
              <b className="num" style={{ marginLeft: 'auto' }}>
                {fmtMoeda(aPagar.data?.total)}
              </b>
            </div>
            <div className="fin-card-corpo" style={{ gap: 0 }}>
              {aPagar.data?.itens.slice(0, 4).map((l) => (
                <div key={l.id} className="fin-conta">
                  <div className="fin-desc">
                    <b>{l.descricao}</b>
                    <small style={l.atrasado ? { color: '#B42318', fontWeight: 600 } : undefined}>
                      {l.atrasado ? 'venceu' : 'vence'} {fmtDataCurta(l.vencimento)}
                    </small>
                  </div>
                  <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                    <b className="num" style={{ fontSize: 13 }}>
                      {fmtMoeda(l.saldo)}
                    </b>
                    <button type="button" className="link-acao" onClick={() => onBaixa(l)}>
                      Pagar
                    </button>
                  </div>
                </div>
              ))}
              {aPagar.data && !aPagar.data.itens.length && (
                <span className="muted">Nenhuma conta em aberto.</span>
              )}
              {(aPagar.data?.itens.length ?? 0) > 4 && (
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginTop: 12 }}
                  onClick={() => onAba(clinica ? 'lancamentos' : 'pagar')}
                >
                  Ver todas ({aPagar.data?.itens.length})
                </button>
              )}
            </div>
          </div>
          {!clinica && <PrecosCartao onEditar={() => onAba('precos')} />}
        </div>
      </div>
    </>
  );
}

function Valor({ l }: { l: Lancamento }) {
  const receita = l.tipo === 'receita';
  return (
    <span className={`fin-valor ${receita && l.situacao === 'pago' ? 'pos' : ''}`}>
      {receita ? '+' : '−'} {fmtMoeda(l.valor)}
    </span>
  );
}

function Linhas({
  itens,
  carregando,
  vazio,
  acoes,
}: {
  itens: Lancamento[];
  carregando: boolean;
  vazio: string;
  acoes?: (l: Lancamento) => React.ReactNode;
}) {
  const classe = `fin-grade lanc ${acoes ? 'acoes' : ''}`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className={`${classe} cab`}>
        <span className="th">Data</span>
        <span className="th">Descrição</span>
        <span className="th">Situação</span>
        <span className="th" style={{ justifySelf: 'end' }}>
          Valor
        </span>
        {acoes && <span />}
      </div>
      {carregando && (
        <div style={{ padding: 16 }}>
          <Carregando linhas={3} />
        </div>
      )}
      {itens.map((l) => {
        const selo = seloLancamento(l);
        return (
          <div key={l.id} className={`${classe} fin-linha`}>
            <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {fmtDataCurta(dataDoLancamento(l))}
            </span>
            <div className="fin-desc">
              <b>{l.descricao}</b>
              <small>
                {detalheLancamento(l)}
                {l.situacao === 'parcial' && ` · falta ${fmtMoeda(l.saldo)}`}
              </small>
            </div>
            <span>
              <span className={`badge ${selo.classe}`}>{selo.texto}</span>
            </span>
            <Valor l={l} />
            {acoes && <div className="fin-acoes">{acoes(l)}</div>}
          </div>
        );
      })}
      {!carregando && !itens.length && <Vazio titulo={vazio} />}
    </div>
  );
}

/** Lista completa com ações: baixa, recibo (clínica) e cancelamento. */
function ListaTab({
  titulo,
  consulta,
  vazio,
  clinica,
  onBaixa,
}: {
  titulo: string;
  consulta: {
    inicio?: string;
    fim?: string;
    tipo?: 'receita' | 'despesa';
    situacao?: 'em_aberto';
  };
  vazio: string;
  clinica: boolean;
  onBaixa: (l: Lancamento) => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [cancelar, setCancelar] = useState<Lancamento | null>(null);
  const lista = useQuery({
    queryKey: ['financeiro', 'lancamentos', consulta],
    queryFn: () => chamar(api.GET('/financeiro/lancamentos', { params: { query: consulta } })),
  });
  // O recibo é gerado no servidor; aqui só chega o link de uso único.
  const recibo = useMutation({
    mutationFn: (id: string) =>
      chamar(
        api.POST('/financeiro/recibos/{lancamentoId}', { params: { path: { lancamentoId: id } } }),
      ),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
  const cancelamento = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      chamar(
        api.POST('/financeiro/lancamentos/{id}/cancelar', {
          params: { path: { id } },
          body: { motivo },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      setCancelar(null);
      avisar('Lançamento cancelado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  if (lista.error) return <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />;
  const itens = [...(lista.data ?? [])];
  if (consulta.situacao) itens.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const total = itens.reduce((n, l) => n + (consulta.situacao ? l.saldo : 0), 0);

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="fin-card-cab">
        <div>
          <h2 className="h3">{titulo}</h2>
          <span className="sub">
            {itens.length} {itens.length === 1 ? 'título' : 'títulos'}
            {consulta.situacao ? ` · ${fmtMoeda(total)} em aberto` : ''}
            {consulta.inicio && consulta.fim
              ? ` · ${fmtDataBR(consulta.inicio)} a ${fmtDataBR(consulta.fim)}`
              : ''}
          </span>
        </div>
      </div>
      <Linhas
        itens={itens}
        carregando={!lista.data}
        vazio={vazio}
        acoes={(l) => (
          <>
            {l.saldo > 0 && (
              <Button pequeno variante="mint" onClick={() => onBaixa(l)}>
                {l.tipo === 'receita' ? 'Receber' : 'Pagar'}
              </Button>
            )}
            {clinica && l.tipo === 'receita' && l.valor_pago > 0 && (
              <Button
                pequeno
                variante="secondary"
                carregando={recibo.isPending && recibo.variables === l.id}
                onClick={() => recibo.mutate(l.id)}
              >
                Recibo
              </Button>
            )}
            {l.valor_pago === 0 && l.situacao !== 'cancelado' && (
              <Button pequeno variante="ghost" onClick={() => setCancelar(l)}>
                Cancelar
              </Button>
            )}
          </>
        )}
      />
      {cancelar && (
        <MotivoDialog
          titulo="Cancelar lançamento"
          descricao={`${cancelar.descricao} · ${fmtMoeda(cancelar.valor)}`}
          rotulo="Motivo do cancelamento"
          confirmar="Cancelar lançamento"
          perigo
          carregando={cancelamento.isPending}
          onConfirmar={(motivo) => cancelamento.mutate({ id: cancelar.id, motivo })}
          onFechar={() => setCancelar(null)}
        />
      )}
    </div>
  );
}
