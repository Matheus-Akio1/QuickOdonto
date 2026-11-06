import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { MotivoRetirada, Produto } from '../../api/types';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { IconeAlerta, IconeCaixa, IconeCheck, IconeFrasco } from '../../components/Icones';
import { Seg } from '../../components/Seg';
import { fmtDataBR, hoje } from '../../lib/datas';
import { fmtQtd, lerQuantidade, MOTIVO, MOTIVOS_DA_UNIDADE } from '../../lib/estoque';
import { fmtMoeda } from '../../lib/moeda';
import { tituloTrabalho } from '../../lib/os';
import { useToast } from '../../toast/useToast';

export type Modo = 'retirada' | 'entrada';

interface Props {
  produtos: Produto[];
  modos: Modo[];
  modo: Modo;
  onModo: (m: Modo) => void;
  produtoId: string;
  onProduto: (id: string) => void;
  onFeito?: () => void;
}

/** Cartão lateral das pranchas: "Registrar retirada" (com vínculo à OS) e "Nova entrada". */
export function PainelMovimento({
  produtos,
  modos,
  modo,
  onModo,
  produtoId,
  onProduto,
  onFeito,
}: Props) {
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const { avisar } = useToast();
  const lab = usuario?.unidade === 'laboratorio';
  const adm = usuario?.perfil === 'adm_clinica' || usuario?.perfil === 'adm_laboratorio';
  const unidade = usuario?.unidade ?? 'clinica';
  const [quantidade, setQuantidade] = useState('');
  const [loteId, setLoteId] = useState('');
  const [osId, setOsId] = useState('');
  const [motivo, setMotivo] = useState<MotivoRetirada>(MOTIVOS_DA_UNIDADE[unidade][0]);
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [custo, setCusto] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [nota, setNota] = useState('');
  const [lancar, setLancar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ordens = useQuery({
    queryKey: ['os', 'lista', 'aberta'],
    enabled: lab && modo === 'retirada',
    queryFn: () => chamar(api.GET('/ordens-servico', { params: { query: { status: 'aberta' } } })),
  });

  const produto = produtos.find((p) => p.id === produtoId);
  const qtd = lerQuantidade(quantidade);
  const custoUn = lerQuantidade(custo);
  const comSaldo = produto?.lotes.filter((l) => l.saldo > 0) ?? [];
  const disponivel = loteId
    ? (comSaldo.find((l) => l.id === loteId)?.saldo ?? 0)
    : (produto?.saldo ?? 0);
  const depois = produto && qtd ? Math.round((produto.saldo - qtd) * 1000) / 1000 : null;
  const insuficiente = qtd !== null && qtd > disponivel;

  const limpar = () => {
    setQuantidade('');
    setLoteId('');
    setOsId('');
    setLote('');
    setValidade('');
    setCusto('');
    setNota('');
    setLancar(false);
    setErro(null);
  };
  const aoConcluir = (texto: string) => {
    qc.invalidateQueries({ queryKey: ['estoque'] });
    avisar(texto, 'ok');
    limpar();
    onFeito?.();
  };

  const retirar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/estoque/retiradas', {
          body: {
            produto_id: produtoId,
            lote_id: loteId || null,
            quantidade: qtd as number,
            os_id: osId || null,
            motivo,
          },
        }),
      ),
    onSuccess: (p) =>
      aoConcluir(`Retirada registrada. Saldo: ${fmtQtd(p.saldo, p.unidade_medida)}.`),
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const entrar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/estoque/entradas', {
          body: {
            produto_id: produtoId,
            quantidade: qtd as number,
            lote: lote.trim() || null,
            validade: validade || null,
            custo_unitario: custoUn as number,
            fornecedor: fornecedor.trim() || null,
            nota_fiscal: nota.trim() || null,
            lancar_financeiro: adm && lancar ? true : undefined,
          },
        }),
      ),
    onSuccess: (p) =>
      aoConcluir(`Entrada registrada. Saldo: ${fmtQtd(p.saldo, p.unidade_medida)}.`),
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const escolherProduto = (id: string) => {
    onProduto(id);
    setLoteId('');
    setFornecedor(produtos.find((p) => p.id === id)?.fornecedor ?? '');
    setErro(null);
  };
  const retirada = modo === 'retirada';

  return (
    <aside className="card" aria-label={retirada ? 'Registrar retirada' : 'Nova entrada'}>
      <div className="est-painel-cab">
        <div className="ic">
          {retirada ? <IconeFrasco tamanho={20} /> : <IconeCaixa tamanho={20} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 className="h2">{retirada ? 'Registrar retirada' : 'Nova entrada'}</h2>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {retirada
              ? lab
                ? 'Baixa no estoque com vínculo à OS'
                : 'Baixa no estoque da clínica'
              : 'Compra e reposição de estoque'}
          </span>
        </div>
      </div>
      <div className="est-painel-corpo">
        {modos.length > 1 && (
          <div>
            <Seg
              rotulo="Tipo de movimentação"
              valor={modo}
              onMudar={(m) => {
                onModo(m);
                setErro(null);
              }}
              opcoes={modos.map((m) => ({
                valor: m,
                rotulo: m === 'retirada' ? 'Retirada' : 'Entrada',
              }))}
            />
          </div>
        )}
        {erro && (
          <div className="est-aviso erro" role="alert">
            <IconeAlerta tamanho={16} />
            <span>{erro}</span>
          </div>
        )}
        <label className="field">
          <span className="label">Produto</span>
          <select
            className="select"
            value={produtoId}
            onChange={(e) => escolherProduto(e.target.value)}
          >
            <option value="">Selecione…</option>
            {[...produtos]
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {fmtQtd(p.saldo, p.unidade_medida)}
                </option>
              ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 12 }}>
          <label className="field">
            <span className="label">Quantidade</span>
            <input
              className="input num"
              inputMode="decimal"
              aria-invalid={retirada && insuficiente}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Unidade</span>
            <input
              className="input"
              readOnly
              tabIndex={-1}
              value={produto?.unidade_medida ?? '—'}
            />
          </label>
        </div>

        {retirada ? (
          <>
            {comSaldo.length > 1 && (
              <label className="field">
                <span className="label">Lote</span>
                <select
                  className="select"
                  value={loteId}
                  onChange={(e) => setLoteId(e.target.value)}
                >
                  <option value="">Automático (o que vence primeiro)</option>
                  {comSaldo.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lote} · {fmtQtd(l.saldo, produto?.unidade_medida)}
                      {l.validade ? ` · val. ${fmtDataBR(l.validade)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {lab && (
              <label className="field">
                <span className="label">Vincular à OS</span>
                <select className="select" value={osId} onChange={(e) => setOsId(e.target.value)}>
                  <option value="">Sem vínculo</option>
                  {ordens.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero} · {tituloTrabalho(o)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label">Motivo</span>
              <div>
                <Seg
                  rotulo="Motivo"
                  valor={motivo}
                  onMudar={setMotivo}
                  opcoes={MOTIVOS_DA_UNIDADE[unidade].map((m) => ({ valor: m, rotulo: MOTIVO[m] }))}
                />
              </div>
            </div>
            <label className="field">
              <span className="label">Responsável</span>
              <input className="input" readOnly tabIndex={-1} value={usuario?.nome ?? ''} />
            </label>
            {produto && qtd !== null && qtd > 0 && (
              <div className={`est-aviso ${insuficiente ? 'erro' : ''}`}>
                <IconeAlerta tamanho={16} />
                {insuficiente ? (
                  <span>
                    Saldo insuficiente: há{' '}
                    <b className="num">{fmtQtd(disponivel, produto.unidade_medida)}</b>
                    {loteId ? ' neste lote' : ' em estoque'}.
                  </span>
                ) : (
                  <span>
                    Saldo após a retirada:{' '}
                    <b className="num">{fmtQtd(depois ?? 0, produto.unidade_medida)}</b> (mínimo{' '}
                    {fmtQtd(produto.estoque_minimo, produto.unidade_medida)}).
                    {depois !== null &&
                      depois < produto.estoque_minimo &&
                      produto.saldo >= produto.estoque_minimo &&
                      ' O administrador será notificado.'}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="label">Lote</span>
                <input
                  className="input"
                  maxLength={40}
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Validade</span>
                <input
                  className="input"
                  type="date"
                  min={hoje()}
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span className="label">
                Custo unitário (R$ por {produto?.unidade_medida ?? 'unidade'})
              </span>
              <input
                className="input num"
                inputMode="decimal"
                placeholder="0,00"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Fornecedor</span>
              <input
                className="input"
                maxLength={120}
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Nota fiscal (número)</span>
              <input
                className="input"
                maxLength={60}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </label>
            {adm && (
              <label className="check">
                <input
                  type="checkbox"
                  className="sw"
                  checked={lancar}
                  onChange={(e) => setLancar(e.target.checked)}
                />
                Lançar a compra no financeiro
                {lancar && qtd && custoUn !== null ? ` (${fmtMoeda(qtd * custoUn)} a pagar)` : ''}
              </label>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variante="secondary" onClick={limpar}>
            Limpar
          </Button>
          {retirada ? (
            <Button
              style={{ flexGrow: 1 }}
              disabled={!produto || !qtd || insuficiente}
              carregando={retirar.isPending}
              onClick={() => {
                setErro(null);
                retirar.mutate();
              }}
            >
              <IconeCheck />
              Confirmar retirada
            </Button>
          ) : (
            <Button
              style={{ flexGrow: 1 }}
              disabled={!produto || !qtd || custoUn === null}
              carregando={entrar.isPending}
              onClick={() => {
                setErro(null);
                entrar.mutate();
              }}
            >
              Registrar entrada
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
