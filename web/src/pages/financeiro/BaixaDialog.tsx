import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { FormaPagamento, Lancamento } from '../../api/types';
import { Button } from '../../components/Button';
import { Overlay } from '../../components/Overlay';
import { hoje } from '../../lib/datas';
import { FORMA, FORMAS, lerValor } from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';

/** Baixa total ou parcial de um título (recebimento de receita ou pagamento de despesa). */
export function BaixaDialog({
  lancamento,
  onFechar,
}: {
  lancamento: Lancamento;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const receita = lancamento.tipo === 'receita';
  const [valor, setValor] = useState(lancamento.saldo.toFixed(2).replace('.', ','));
  const [forma, setForma] = useState<FormaPagamento | ''>(lancamento.forma ?? '');
  const [data, setData] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const v = lerValor(valor);
  const acima = v !== null && v > lancamento.saldo;

  const baixar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/financeiro/lancamentos/{id}/baixa', {
          params: { path: { id: lancamento.id } },
          body: { valor: v as number, forma: forma as FormaPagamento, data },
        }),
      ),
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      avisar(
        l.situacao === 'pago'
          ? receita
            ? 'Recebimento registrado: título quitado.'
            : 'Pagamento registrado: conta quitada.'
          : `Baixa parcial registrada. Saldo: ${fmtMoeda(l.saldo)}.`,
        'ok',
      );
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo={receita ? 'Registrar recebimento' : 'Registrar pagamento'}
      descricao={`${lancamento.descricao} · saldo ${fmtMoeda(lancamento.saldo)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Voltar
          </Button>
          <Button
            disabled={v === null || acima || !forma || !data || data > hoje()}
            carregando={baixar.isPending}
            onClick={() => {
              setErro(null);
              baixar.mutate();
            }}
          >
            {receita ? 'Confirmar recebimento' : 'Confirmar pagamento'}
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
        <div className="form-grid">
          <label className="field">
            <span className="label">Valor</span>
            <input
              className="input num"
              inputMode="decimal"
              aria-invalid={v === null || acima}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            {acima && <span className="error">Maior que o saldo em aberto.</span>}
          </label>
          <label className="field">
            <span className="label">Data</span>
            <input
              className="input"
              type="date"
              max={hoje()}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="label">Forma de pagamento</span>
          <select
            className="select"
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaPagamento | '')}
          >
            <option value="">Selecione…</option>
            {FORMAS.map((f) => (
              <option key={f} value={f}>
                {FORMA[f]}
              </option>
            ))}
          </select>
        </label>
        <span className="hint">
          Valor menor que o saldo registra uma baixa parcial; o restante continua em aberto.
        </span>
      </div>
    </Overlay>
  );
}
