import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { lerValor } from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';

function usePrecos() {
  return useQuery({
    queryKey: ['financeiro', 'precos'],
    queryFn: () => chamar(api.GET('/laboratorio/tabela-precos')),
  });
}

/** Cartão resumido da tabela de preços (prancha "Adm. Laboratório · financeiro"). */
export function PrecosCartao({ onEditar }: { onEditar: () => void }) {
  const precos = usePrecos();
  const padrao = (precos.data ?? []).filter((p) => !p.cliente_id);
  return (
    <div className="card">
      <div className="fin-card-cab">
        <h2 className="h3">Tabela de preços</h2>
        <button type="button" className="btn xs" style={{ marginLeft: 'auto' }} onClick={onEditar}>
          Editar
        </button>
      </div>
      <div className="fin-card-corpo" style={{ gap: 8 }}>
        {padrao.slice(0, 6).map((p) => (
          <div key={p.id} className="fin-par">
            <span>{p.tipo_trabalho}</span>
            <b>{fmtMoeda(p.valor)}</b>
          </div>
        ))}
        {precos.data && !padrao.length && <span className="muted">Nenhum preço cadastrado.</span>}
        <span className="muted" style={{ fontSize: 12 }}>
          Cada cliente pode ter preços próprios; o valor da OS vem desta tabela.
        </span>
      </div>
    </div>
  );
}

/** Aba "Tabela de preços": preço padrão por tipo de trabalho e preços próprios por cliente. */
export function PrecosTab() {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const precos = usePrecos();
  const clientes = useQuery({
    queryKey: ['lab-clientes', 'lista'],
    queryFn: () => chamar(api.GET('/laboratorio/clientes')),
  });
  const [tipo, setTipo] = useState('');
  const [cliente, setCliente] = useState('');
  const [valor, setValor] = useState('');
  const v = lerValor(valor);

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        api.PUT('/laboratorio/tabela-precos', {
          body: {
            itens: [
              { tipo_trabalho: tipo.trim(), cliente_id: cliente || null, valor: v as number },
            ],
          },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeiro', 'precos'] });
      avisar('Preço gravado. Vale para as próximas OS.', 'ok');
      setTipo('');
      setValor('');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  if (precos.error) return <ErroCarga erro={precos.error} onTentar={() => precos.refetch()} />;
  const tipos = [...new Set((precos.data ?? []).map((p) => p.tipo_trabalho))];

  return (
    <div className="fin-layout">
      <div className="fin-principal">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="fin-card-cab">
            <div>
              <h2 className="h3">Preços vigentes</h2>
              <span className="sub">
                O preço próprio do cliente vale no lugar do padrão. OS já lançadas não mudam.
              </span>
            </div>
          </div>
          {!precos.data ? (
            <div style={{ padding: 16 }}>
              <Carregando linhas={3} />
            </div>
          ) : !precos.data.length ? (
            <Vazio titulo="Nenhum preço cadastrado" />
          ) : (
            precos.data.map((p) => (
              <button
                key={p.id}
                type="button"
                className="fin-movel-linha"
                style={{ padding: '6px 20px' }}
                onClick={() => {
                  setTipo(p.tipo_trabalho);
                  setCliente(p.cliente_id ?? '');
                  setValor(p.valor.toFixed(2).replace('.', ','));
                }}
              >
                <span className="fin-desc">
                  <b>{p.tipo_trabalho}</b>
                  <small>{p.cliente_nome ?? 'Preço padrão'}</small>
                </span>
                <span className="fin-valor">{fmtMoeda(p.valor)}</span>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="fin-lateral">
        <div className="card">
          <div className="fin-card-cab">
            <div>
              <h2 className="h3">Definir preço</h2>
              <span className="sub">Clique em uma linha para alterar</span>
            </div>
          </div>
          <div className="fin-card-corpo">
            <label className="field">
              <span className="label">Tipo de trabalho</span>
              <input
                className="input"
                list="fin-tipos"
                maxLength={120}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              />
              <datalist id="fin-tipos">
                {tipos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span className="label">Cliente</span>
              <select
                className="select"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              >
                <option value="">Preço padrão (todos)</option>
                {clientes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Valor</span>
              <input
                className="input num"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>
            <Button
              disabled={tipo.trim().length < 2 || v === null}
              carregando={salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              Gravar preço
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
