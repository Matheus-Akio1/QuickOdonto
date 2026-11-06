import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar } from '../../api/client';
import type { Lote, Movimentacao, Produto } from '../../api/types';
import { NOME_PAINEL } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Abas } from '../../components/Abas';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { IconeAlerta, IconeEditar, IconeFrasco, IconeMais } from '../../components/Icones';
import { Overlay } from '../../components/Overlay';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { fmtDataBR, fmtDataHora } from '../../lib/datas';
import { descricaoDoProduto, fmtQtd, larguraDaBarra, MOTIVO, SITUACAO } from '../../lib/estoque';
import { fmtMoeda } from '../../lib/moeda';
import { useCelular, useMedia } from '../../lib/useCelular';
import { AjusteDialog } from './AjusteDialog';
import { PainelMovimento, type Modo } from './PainelMovimento';
import { ProdutoForm } from './ProdutoForm';

type Aba = 'estoque' | 'retiradas' | 'entradas' | 'inventario';

const TITULO = {
  laboratorio: 'Estoque',
  adm_clinica: 'Estoque da clínica',
  adm_laboratorio: 'Estoque do laboratório',
} as const;

/**
 * Estoque da unidade do usuário. O técnico do laboratório registra retiradas (e entradas, se
 * tiver a permissão) e não vê custo; a administração vê valores, cadastra produto e faz inventário.
 */
export function EstoquePage() {
  const { usuario } = useAuth();
  const celular = useCelular();
  // Em notebook o painel lateral espremeria a tabela: ele abre em gaveta, como no celular.
  const compacto = useMedia('(max-width: 1400px)');
  const [aba, setAba] = useState<Aba>('estoque');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [modo, setModo] = useState<Modo | null>(null);
  const [produtoId, setProdutoId] = useState('');
  const [painelMovel, setPainelMovel] = useState(false);
  const [form, setForm] = useState<{ produto?: Produto } | null>(null);
  const [ajuste, setAjuste] = useState<{ produto: Produto; lote: Lote } | null>(null);

  const perfil = usuario?.perfil;
  const adm = perfil === 'adm_clinica' || perfil === 'adm_laboratorio';
  const admLab = perfil === 'adm_laboratorio';

  const produtos = useQuery({
    queryKey: ['estoque', 'produtos'],
    queryFn: () => chamar(api.GET('/estoque/produtos')),
  });
  const resumo = useQuery({
    queryKey: ['estoque', 'resumo'],
    queryFn: () => chamar(api.GET('/estoque/resumo')),
  });
  const tipoMov = aba === 'retiradas' ? 'retirada' : aba === 'entradas' ? 'entrada' : 'ajuste';
  const movimentos = useQuery({
    queryKey: ['estoque', 'movimentacoes', tipoMov],
    enabled: aba !== 'estoque',
    queryFn: () =>
      chamar(api.GET('/estoque/movimentacoes', { params: { query: { tipo: tipoMov } } })),
  });
  const custoOs = useQuery({
    queryKey: ['estoque', 'custo-por-os'],
    enabled: admLab,
    queryFn: () => chamar(api.GET('/estoque/custo-por-os')),
  });

  if (!usuario || !perfil || !(perfil in TITULO)) return null;
  const titulo = TITULO[perfil as keyof typeof TITULO];
  const podeEntrada = adm || usuario.permissoes.entrada_estoque === true;
  // A prancha do técnico abre na retirada; a da administração, na entrada.
  const modos: Modo[] = adm
    ? ['entrada', 'retirada']
    : podeEntrada
      ? ['retirada', 'entrada']
      : ['retirada'];
  const modoAtual = modo && modos.includes(modo) ? modo : modos[0];
  const modoInicial = modos[0];

  const lista = produtos.data ?? [];
  const categorias = [...new Set(lista.map((p) => p.categoria).filter(Boolean))].sort() as string[];
  const t = busca.trim().toLowerCase();
  const visiveis = lista.filter(
    (p) =>
      (!categoria || p.categoria === categoria) &&
      (!t || [p.nome, p.codigo, p.categoria ?? ''].some((v) => v.toLowerCase().includes(t))),
  );
  const r = resumo.data;
  const abrirPainel = (m: Modo, id?: string) => {
    setModo(m);
    if (id) setProdutoId(id);
    if (compacto) setPainelMovel(true);
  };

  const painel = (
    <PainelMovimento
      produtos={lista}
      modos={modos}
      modo={modoAtual}
      onModo={setModo}
      produtoId={produtoId}
      onProduto={setProdutoId}
      onFeito={() => setPainelMovel(false)}
    />
  );

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'estoque', rotulo: 'Em estoque' },
    { id: 'retiradas', rotulo: 'Histórico de retiradas' },
    { id: 'entradas', rotulo: 'Entradas' },
    ...(adm ? [{ id: 'inventario' as const, rotulo: 'Inventário' }] : []),
  ];

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[perfil]} / Estoque`} titulo={celular ? 'Estoque' : titulo}>
        {!celular && (
          <BuscaCabecalho
            valor={busca}
            onMudar={setBusca}
            placeholder="Buscar produto"
            largura={280}
          />
        )}
        {adm && !celular && (
          <button type="button" className="btn" onClick={() => setForm({})}>
            <IconeMais />
            Novo produto
          </button>
        )}
        {podeEntrada && !celular && (
          <button type="button" className="btn" onClick={() => abrirPainel('entrada')}>
            <IconeMais />
            Nova entrada
          </button>
        )}
        {compacto && !celular && (
          <button type="button" className="btn pri" onClick={() => abrirPainel('retirada')}>
            <IconeFrasco />
            Registrar retirada
          </button>
        )}
      </Cabecalho>

      <div className="content">
        {produtos.error && <ErroCarga erro={produtos.error} onTentar={() => produtos.refetch()} />}

        {celular ? (
          <>
            {r && (r.abaixo_minimo > 0 || r.lotes_vencendo > 0) && (
              <div className="est-aviso" style={{ alignItems: 'center', fontWeight: 600 }}>
                <IconeAlerta tamanho={18} />
                <span>
                  {r.abaixo_minimo} {r.abaixo_minimo === 1 ? 'item' : 'itens'} abaixo do mínimo ·{' '}
                  {r.lotes_vencendo} {r.lotes_vencendo === 1 ? 'lote' : 'lotes'} vencendo
                </span>
              </div>
            )}
            <div className="card" style={{ overflow: 'hidden' }}>
              {!produtos.data ? (
                <div style={{ padding: 16 }}>
                  <Carregando />
                </div>
              ) : (
                visiveis.map((p) => <LinhaMovel key={p.id} p={p} />)
              )}
              {produtos.data && !visiveis.length && <Vazio titulo="Nenhum produto" />}
            </div>
            <button
              type="button"
              className="btn pri est-acao-movel"
              style={{ height: 52, fontSize: 15, borderRadius: 13 }}
              onClick={() => abrirPainel(modoInicial)}
            >
              <IconeFrasco />
              {modoInicial === 'retirada' ? 'Registrar retirada' : 'Nova entrada'}
            </button>
          </>
        ) : (
          <div className="est-layout">
            <div className="est-principal">
              <div
                className="est-indicadores"
                style={{ gridTemplateColumns: `repeat(${adm ? 4 : 3}, minmax(0, 1fr))` }}
              >
                {admLab && (
                  <Indicador
                    rotulo="Valor em estoque"
                    valor={fmtMoeda(r?.valor_estoque)}
                    nota="custo médio"
                  />
                )}
                <Indicador
                  rotulo="Abaixo do mínimo"
                  ponto="#D92D20"
                  cor="#B42318"
                  valor={r?.abaixo_minimo ?? '—'}
                  nota={r?.abaixo_minimo === 1 ? 'item para repor' : 'itens para repor'}
                />
                <Indicador
                  rotulo="Vencendo em 30 dias"
                  ponto="#DE6B2F"
                  cor="#B54708"
                  valor={r?.lotes_vencendo ?? '—'}
                  nota={r?.lotes_vencendo === 1 ? 'lote' : 'lotes'}
                />
                {perfil === 'laboratorio' && (
                  <Indicador
                    rotulo="Retiradas hoje"
                    ponto="#6553D6"
                    cor="#43339A"
                    valor={r?.retiradas_hoje ?? '—'}
                    nota={`${r?.retiradas_hoje_os ?? 0} ${r?.retiradas_hoje_os === 1 ? 'vinculada' : 'vinculadas'} a OS`}
                  />
                )}
                {perfil === 'adm_clinica' && (
                  <Indicador
                    rotulo="Valor em estoque"
                    valor={fmtMoeda(r?.valor_estoque)}
                    nota="custo médio"
                  />
                )}
                {adm && (
                  <Indicador
                    rotulo="Consumo do mês"
                    valor={fmtMoeda(r?.consumo_mes)}
                    nota={admLab ? `vinculado a ${r?.os_no_mes ?? 0} OS` : 'retiradas registradas'}
                  />
                )}
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="est-abas">
                  <Abas abas={abas} ativa={aba} onMudar={(id) => setAba(id as Aba)} />
                  {(aba === 'estoque' || aba === 'inventario') && (
                    <select
                      className="sel-chip"
                      aria-label="Categoria"
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                    >
                      <option value="">Todas as categorias</option>
                      {categorias.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {aba === 'estoque' && (
                  <>
                    <div className={`est-grade cab ${adm ? 'adm' : 'tec'}`}>
                      <span className="th">Produto</span>
                      <span className="th">Saldo</span>
                      {adm && (
                        <span className="th">{admLab ? 'Valor · custo médio' : 'Custo médio'}</span>
                      )}
                      <span className="th">Situação</span>
                      {adm && <span />}
                    </div>
                    {!produtos.data && (
                      <div style={{ padding: 16 }}>
                        <Carregando />
                      </div>
                    )}
                    {visiveis.map((p) => (
                      <div key={p.id} className={`est-grade est-linha ${adm ? 'adm' : 'tec'}`}>
                        <div className="est-prod">
                          <b>{p.nome}</b>
                          <small>{descricaoDoProduto(p)}</small>
                        </div>
                        <Saldo p={p} />
                        {adm && (
                          <div className="est-prod num">
                            {admLab ? (
                              <>
                                <b>{fmtMoeda(p.valor)}</b>
                                <small>
                                  {fmtMoeda(p.custo_medio)}/{p.unidade_medida}
                                </small>
                              </>
                            ) : (
                              <span style={{ fontSize: 14 }}>{fmtMoeda(p.custo_medio)}</span>
                            )}
                          </div>
                        )}
                        <span>
                          <span className={`badge ${SITUACAO[p.situacao].classe}`}>
                            {SITUACAO[p.situacao].texto}
                          </span>
                        </span>
                        {adm && (
                          <button
                            type="button"
                            className="ibtn g"
                            aria-label={`Editar ${p.nome}`}
                            onClick={() => setForm({ produto: p })}
                          >
                            <IconeEditar />
                          </button>
                        )}
                      </div>
                    ))}
                    {produtos.data && !visiveis.length && (
                      <Vazio titulo="Nenhum produto encontrado" />
                    )}
                    <div className="est-rodape">
                      {visiveis.length} {visiveis.length === 1 ? 'produto' : 'produtos'} · ordenados
                      por situação
                    </div>
                  </>
                )}

                {(aba === 'retiradas' || aba === 'entradas') && (
                  <Historico
                    tipo={aba}
                    dados={movimentos.data}
                    erro={movimentos.error}
                    comCusto={adm}
                  />
                )}

                {aba === 'inventario' && (
                  <>
                    <div className="est-grade cab inv">
                      <span className="th">Produto</span>
                      <span className="th">Lote</span>
                      <span className="th">Validade</span>
                      <span className="th">Saldo</span>
                      <span />
                    </div>
                    {visiveis.flatMap((p) =>
                      p.lotes.map((l) => (
                        <div key={l.id} className="est-grade est-linha inv">
                          <div className="est-prod">
                            <b>{p.nome}</b>
                            <small>{[p.categoria, p.codigo].filter(Boolean).join(' · ')}</small>
                          </div>
                          <span className="num">{l.lote}</span>
                          <span className="num">{l.validade ? fmtDataBR(l.validade) : '—'}</span>
                          <b className="num">{fmtQtd(l.saldo, p.unidade_medida)}</b>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => setAjuste({ produto: p, lote: l })}
                          >
                            Ajustar
                          </button>
                        </div>
                      )),
                    )}
                    <Historico
                      tipo="ajustes"
                      dados={movimentos.data}
                      erro={movimentos.error}
                      comCusto={false}
                    />
                    <div className="est-rodape">
                      Ajustes exigem justificativa e ficam na trilha de auditoria.
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="est-lateral">
              {!compacto && painel}
              {admLab && (
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h2 className="h3">Custo de material por OS</h2>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>neste mês</span>
                  </div>
                  {custoOs.data?.ranking?.slice(0, 5).map((o) => (
                    <div key={o.id} className="est-custo-os">
                      <span>
                        {o.numero} · {o.tipo_trabalho}
                      </span>
                      <b className="num">{fmtMoeda(o.total)}</b>
                    </div>
                  ))}
                  {custoOs.data && !custoOs.data.ranking?.length && (
                    <p className="muted" style={{ marginTop: 8 }}>
                      Nenhuma retirada vinculada a OS neste mês.
                    </p>
                  )}
                  <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                    As retiradas vinculadas à OS entram no cálculo da margem.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {painelMovel && (
        <Overlay
          tipo="drawer"
          titulo={modoAtual === 'retirada' ? 'Retirada' : 'Entrada'}
          onFechar={() => setPainelMovel(false)}
        >
          {painel}
        </Overlay>
      )}
      {form && <ProdutoForm produto={form.produto} onFechar={() => setForm(null)} />}
      {ajuste && (
        <AjusteDialog
          produto={ajuste.produto}
          lote={ajuste.lote}
          onFechar={() => setAjuste(null)}
        />
      )}
    </>
  );
}

function Indicador({
  rotulo,
  valor,
  nota,
  ponto,
  cor,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  ponto?: string;
  cor?: string;
}) {
  return (
    <div className="card est-ind">
      <div className="cab">
        {ponto && <i style={{ background: ponto }} />}
        <span className="eyebrow">{rotulo}</span>
      </div>
      <span className="disp num valor" style={{ color: cor }}>
        {valor}
      </span>
      <div className="nota">{nota}</div>
    </div>
  );
}

function Barra({ p }: { p: Produto }) {
  return (
    <div className="est-barra" aria-hidden="true">
      <div
        style={{
          width: `${larguraDaBarra(p.saldo, p.estoque_minimo)}%`,
          background: p.situacao === 'abaixo_minimo' ? '#D92D20' : '#12A150',
        }}
      />
      <span />
    </div>
  );
}

function Saldo({ p }: { p: Produto }) {
  return (
    <div className="est-saldo">
      <div className="nums">
        <b>{fmtQtd(p.saldo, p.unidade_medida)}</b>
        <small>mín. {fmtQtd(p.estoque_minimo, p.unidade_medida)}</small>
      </div>
      <Barra p={p} />
    </div>
  );
}

function LinhaMovel({ p }: { p: Produto }) {
  const urgente = p.situacao === 'vencendo' || p.situacao === 'vencido';
  return (
    <div className="est-movel-linha">
      <div className="l1">
        <b>{p.nome}</b>
        {urgente && p.proxima_validade && (
          <span className="badge b-warn selo-sm" style={{ height: 20 }}>
            vence {fmtDataBR(p.proxima_validade).slice(0, 5)}
          </span>
        )}
        <b
          className="num"
          style={{
            flexGrow: 0,
            whiteSpace: 'nowrap',
            color: p.situacao === 'abaixo_minimo' ? '#B42318' : 'var(--ink)',
          }}
        >
          {fmtQtd(p.saldo, p.unidade_medida)}
        </b>
      </div>
      <Barra p={p} />
      <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        mín. {fmtQtd(p.estoque_minimo, p.unidade_medida)}
      </span>
    </div>
  );
}

function Historico({
  tipo,
  dados,
  erro,
  comCusto,
}: {
  tipo: 'retiradas' | 'entradas' | 'ajustes';
  dados?: Movimentacao[];
  erro: unknown;
  comCusto: boolean;
}) {
  if (erro) return <ErroCarga erro={erro} />;
  if (!dados) {
    return (
      <div style={{ padding: 16 }}>
        <Carregando linhas={3} />
      </div>
    );
  }
  if (!dados.length) {
    return tipo === 'ajustes' ? null : (
      <Vazio
        titulo={tipo === 'retiradas' ? 'Nenhuma retirada registrada' : 'Nenhuma entrada registrada'}
      />
    );
  }
  const detalhe = (m: Movimentacao) => {
    if (tipo === 'retiradas') {
      return [m.motivo ? MOTIVO[m.motivo] : null, m.os?.numero, m.justificativa]
        .filter(Boolean)
        .join(' · ');
    }
    if (tipo === 'entradas') {
      return [
        m.fornecedor,
        m.nota_fiscal,
        comCusto && m.custo !== undefined
          ? `${fmtMoeda(m.custo)}/${m.produto.unidade_medida}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    return m.justificativa ?? '';
  };
  return (
    <>
      <div className="est-grade cab mov">
        <span className="th">{tipo === 'ajustes' ? 'Ajuste em' : 'Quando'}</span>
        <span className="th">Produto</span>
        <span className="th">Quantidade</span>
        <span className="th">
          {tipo === 'retiradas'
            ? 'Motivo · OS'
            : tipo === 'entradas'
              ? 'Fornecedor · NF'
              : 'Justificativa'}
        </span>
        <span className="th">Responsável</span>
      </div>
      {dados.map((m) => (
        <div key={m.id} className="est-grade est-linha mov" style={{ minHeight: 48 }}>
          <span className="num" style={{ fontSize: 13 }}>
            {fmtDataHora(m.em).replace(' às ', ' ')}
          </span>
          <div className="est-prod">
            <b>{m.produto.nome}</b>
            <small>lote {m.lote}</small>
          </div>
          <b className="num">
            {tipo === 'ajustes' && m.quantidade > 0 ? '+' : ''}
            {fmtQtd(m.quantidade, m.produto.unidade_medida)}
          </b>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{detalhe(m) || '—'}</span>
          <span style={{ fontSize: 13 }}>{m.usuario_nome ?? '—'}</span>
        </div>
      ))}
    </>
  );
}
