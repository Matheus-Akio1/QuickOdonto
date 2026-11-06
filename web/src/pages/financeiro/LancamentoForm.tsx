import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { FormaPagamento, LancamentoEntrada } from '../../api/types';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { Overlay } from '../../components/Overlay';
import { Seg } from '../../components/Seg';
import { hoje } from '../../lib/datas';
import { FORMA, FORMAS, lerValor } from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';

type Condicao = 'unico' | 'parcelado' | 'recorrente';

/** Novo lançamento: receita ou despesa, à vista, parcelado ou recorrente mensal. */
export function LancamentoForm({
  tipoInicial = 'receita',
  onFechar,
}: {
  tipoInicial?: 'receita' | 'despesa';
  onFechar: () => void;
}) {
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const { avisar } = useToast();
  const clinica = usuario?.unidade === 'clinica';
  const [tipo, setTipo] = useState<'receita' | 'despesa'>(tipoInicial);
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(hoje());
  const [forma, setForma] = useState<FormaPagamento | ''>('');
  const [condicao, setCondicao] = useState<Condicao>('unico');
  const [vezes, setVezes] = useState(2);
  const [quitado, setQuitado] = useState(false);
  const [cliente, setCliente] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['financeiro', 'categorias'],
    queryFn: () => chamar(api.GET('/financeiro/categorias')),
    staleTime: 60_000,
  });
  const clientes = useQuery({
    queryKey: ['lab-clientes', 'lista'],
    enabled: !clinica && tipo === 'receita',
    queryFn: () => chamar(api.GET('/laboratorio/clientes')),
  });
  // A administração não lê o cadastro de pacientes: o nome vai na descrição, sem vínculo.
  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === tipo);
  const v = lerValor(valor);
  const unicoPago = condicao === 'unico' && quitado;

  const salvar = useMutation({
    mutationFn: () => {
      const body: LancamentoEntrada = {
        tipo,
        categoria_id: categoria,
        descricao: descricao.trim(),
        valor: v as number,
        vencimento,
        forma: forma || null,
      };
      if (!clinica && tipo === 'receita' && cliente) body.cliente_id = cliente;
      if (condicao === 'parcelado') body.parcelas = vezes;
      if (condicao === 'recorrente') {
        body.recorrencia = 'mensal';
        body.repeticoes = vezes;
      }
      if (unicoPago) body.baixa = { forma: forma as FormaPagamento };
      return chamar(api.POST('/financeiro/lancamentos', { body }));
    },
    onSuccess: (criados) => {
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      avisar(
        criados.length > 1 ? `${criados.length} lançamentos criados.` : 'Lançamento criado.',
        'ok',
      );
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const podeSalvar =
    Boolean(categoria) &&
    descricao.trim().length >= 2 &&
    v !== null &&
    Boolean(vencimento) &&
    (!unicoPago || Boolean(forma)) &&
    (condicao === 'unico' || (vezes >= 2 && vezes <= 36));

  return (
    <Overlay
      titulo="Novo lançamento"
      descricao={clinica ? 'Financeiro da clínica' : 'Financeiro do laboratório'}
      onFechar={onFechar}
      largo
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={!podeSalvar}
            carregando={salvar.isPending}
            onClick={() => {
              setErro(null);
              salvar.mutate();
            }}
          >
            Salvar lançamento
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
        <div>
          <Seg
            rotulo="Tipo"
            valor={tipo}
            onMudar={(t) => {
              setTipo(t);
              setCategoria('');
            }}
            opcoes={[
              { valor: 'receita', rotulo: 'Receita' },
              { valor: 'despesa', rotulo: 'Despesa' },
            ]}
          />
        </div>
        <label className="field">
          <span className="label">Descrição</span>
          <input
            className="input"
            maxLength={160}
            placeholder={
              tipo === 'receita' ? 'Ex.: Juliana Martins · parcela 3/6' : 'Ex.: Aluguel da sala'
            }
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="label">Categoria</span>
            <select
              className="select"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Selecione…</option>
              {doTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">
              Valor{' '}
              {condicao === 'parcelado' ? 'total' : condicao === 'recorrente' ? 'por mês' : ''}
            </span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="0,00"
              aria-invalid={valor !== '' && v === null}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">
              {condicao === 'unico' ? 'Vencimento' : 'Primeiro vencimento'}
            </span>
            <input
              className="input"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Forma de pagamento</span>
            <select
              className="select"
              value={forma}
              onChange={(e) => setForma(e.target.value as FormaPagamento | '')}
            >
              <option value="">A definir</option>
              {FORMAS.map((f) => (
                <option key={f} value={f}>
                  {FORMA[f]}
                </option>
              ))}
            </select>
          </label>
          {!clinica && tipo === 'receita' && (
            <label className="field">
              <span className="label">Cliente (opcional)</span>
              <select
                className="select"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              >
                <option value="">Sem cliente</option>
                {clientes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Condição</span>
          <div>
            <Seg
              rotulo="Condição"
              valor={condicao}
              onMudar={setCondicao}
              opcoes={[
                { valor: 'unico', rotulo: 'Único' },
                { valor: 'parcelado', rotulo: 'Parcelado' },
                { valor: 'recorrente', rotulo: 'Todo mês' },
              ]}
            />
          </div>
          {condicao === 'unico' ? (
            <label className="check">
              <input
                type="checkbox"
                checked={quitado}
                onChange={(e) => setQuitado(e.target.checked)}
              />
              {tipo === 'receita' ? 'Já recebido hoje' : 'Já pago hoje'} (informe a forma de
              pagamento)
            </label>
          ) : (
            <label className="field" style={{ maxWidth: 220 }}>
              <span className="label">
                {condicao === 'parcelado' ? 'Número de parcelas' : 'Repetir por quantos meses'}
              </span>
              <input
                className="input num"
                type="number"
                min={2}
                max={36}
                value={vezes}
                onChange={(e) => setVezes(Number(e.target.value))}
              />
            </label>
          )}
          {condicao === 'parcelado' && v !== null && vezes >= 2 && (
            <span className="hint">
              {vezes} parcelas mensais de cerca de {fmtMoeda(Math.floor((v * 100) / vezes) / 100)}.
            </span>
          )}
          {condicao === 'recorrente' && v !== null && vezes >= 2 && (
            <span className="hint">
              {vezes} lançamentos mensais de {fmtMoeda(v)}.
            </span>
          )}
        </div>
      </div>
    </Overlay>
  );
}
