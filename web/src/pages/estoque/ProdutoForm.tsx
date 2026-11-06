import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Produto, ProdutoEntrada } from '../../api/types';
import { Button } from '../../components/Button';
import { Overlay } from '../../components/Overlay';
import { lerQuantidade } from '../../lib/estoque';
import { useToast } from '../../toast/useToast';

/** Cadastro e edição de produto (só administração). O saldo entra por "Nova entrada". */
export function ProdutoForm({ produto, onFechar }: { produto?: Produto; onFechar: () => void }) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState(produto?.nome ?? '');
  const [codigo, setCodigo] = useState(produto?.codigo ?? '');
  const [categoria, setCategoria] = useState(produto?.categoria ?? '');
  const [unidade, setUnidade] = useState(produto?.unidade_medida ?? '');
  const [minimo, setMinimo] = useState(produto ? String(produto.estoque_minimo) : '');
  const [fornecedor, setFornecedor] = useState(produto?.fornecedor ?? '');
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);

  const min = minimo.trim() === '' ? 0 : lerQuantidade(minimo);
  const salvar = useMutation({
    mutationFn: () => {
      const body: ProdutoEntrada = {
        nome: nome.trim(),
        codigo: codigo.trim(),
        categoria: categoria.trim() || null,
        unidade_medida: unidade.trim(),
        estoque_minimo: min ?? 0,
        fornecedor: fornecedor.trim() || null,
      };
      if (!produto) return chamar(api.POST('/estoque/produtos', { body }));
      return chamar(
        api.PATCH('/estoque/produtos/{id}', {
          params: { path: { id: produto.id } },
          body: { ...body, ativo },
        }),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estoque'] });
      avisar(produto ? 'Produto atualizado.' : 'Produto cadastrado.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      tipo="drawer"
      titulo={produto ? 'Editar produto' : 'Novo produto'}
      descricao={
        produto ? undefined : 'Depois de cadastrar, registre a entrada para criar o saldo.'
      }
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={nome.trim().length < 2 || !codigo.trim() || !unidade.trim() || min === null}
            carregando={salvar.isPending}
            onClick={() => {
              setErro(null);
              salvar.mutate();
            }}
          >
            Salvar
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
          <span className="label">Nome</span>
          <input
            className="input"
            maxLength={120}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="label">Código</span>
            <input
              className="input"
              maxLength={30}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Categoria</span>
            <input
              className="input"
              maxLength={60}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Unidade de medida</span>
            <input
              className="input"
              maxLength={20}
              placeholder="g, kg, un, caixas…"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Estoque mínimo</span>
            <input
              className="input num"
              inputMode="decimal"
              aria-invalid={min === null}
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="label">Fornecedor habitual</span>
          <input
            className="input"
            maxLength={120}
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
          />
        </label>
        {produto && (
          <label className="check">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Produto ativo (para inativar, o saldo precisa estar zerado)
          </label>
        )}
      </div>
    </Overlay>
  );
}
