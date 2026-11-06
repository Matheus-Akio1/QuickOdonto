import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Lote, Produto } from '../../api/types';
import { Button } from '../../components/Button';
import { Overlay } from '../../components/Overlay';
import { fmtQtd, lerQuantidade } from '../../lib/estoque';
import { useToast } from '../../toast/useToast';

/** Ajuste de inventário de um lote: saldo contado + justificativa (fica na trilha de auditoria). */
export function AjusteDialog({
  produto,
  lote,
  onFechar,
}: {
  produto: Produto;
  lote: Lote;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [contado, setContado] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const n = lerQuantidade(contado);
  const diferenca = n === null ? null : Math.round((n - lote.saldo) * 1000) / 1000;

  const ajustar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/estoque/ajustes', {
          body: {
            produto_id: produto.id,
            lote_id: lote.id,
            saldo_contado: n as number,
            justificativa: justificativa.trim(),
          },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estoque'] });
      avisar('Ajuste de inventário registrado.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo="Ajuste de inventário"
      descricao={`${produto.nome} · lote ${lote.lote} · saldo no sistema: ${fmtQtd(lote.saldo, produto.unidade_medida)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Voltar
          </Button>
          <Button
            disabled={!diferenca || justificativa.trim().length < 5}
            carregando={ajustar.isPending}
            onClick={() => {
              setErro(null);
              ajustar.mutate();
            }}
          >
            Registrar ajuste
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
        <label className="field">
          <span className="label">Saldo contado ({produto.unidade_medida})</span>
          <input
            className="input num"
            inputMode="decimal"
            value={contado}
            onChange={(e) => setContado(e.target.value)}
          />
          {diferenca !== null && (
            <span className="hint">
              {diferenca === 0
                ? 'Igual ao saldo do sistema: nada a ajustar.'
                : `Diferença: ${diferenca > 0 ? '+' : ''}${fmtQtd(diferenca, produto.unidade_medida)}`}
            </span>
          )}
        </label>
        <label className="field">
          <span className="label">Justificativa</span>
          <textarea
            className="textarea"
            maxLength={300}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
          <span className="hint">
            Obrigatória (mín. 5 caracteres). Fica na trilha de auditoria.
          </span>
        </label>
      </div>
    </Overlay>
  );
}
