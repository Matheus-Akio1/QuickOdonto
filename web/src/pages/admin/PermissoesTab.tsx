import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { useToast } from '../../toast/useToast';

const ROTULOS: Record<string, { titulo: string; dica: string }> = {
  entrada_estoque: {
    titulo: 'Registrar entrada de estoque',
    dica: 'Permite lançar compras e reposições (com lote, validade e custo).',
  },
  criar_os_externa: {
    titulo: 'Criar OS de cliente externo',
    dica: 'Permite cadastrar manualmente ordens de serviço de clínicas externas.',
  },
  cancelar_os: {
    titulo: 'Cancelar ordens de serviço',
    dica: 'Permite cancelar OS informando o motivo.',
  },
};

export function PermissoesTab() {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [valores, setValores] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ['permissoes', 'laboratorio'],
    queryFn: () =>
      chamar(
        api.GET('/perfis/{perfil}/permissoes', { params: { path: { perfil: 'laboratorio' } } }),
      ),
  });
  useEffect(() => {
    if (q.data) setValores(q.data.permissoes);
  }, [q.data]);

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        api.PUT('/perfis/{perfil}/permissoes', {
          params: { path: { perfil: 'laboratorio' } },
          body: { permissoes: valores },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissoes'] });
      avisar('Permissões salvas.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  if (q.error) return <ErroCarga erro={q.error} onTentar={() => q.refetch()} />;
  if (!q.data) return <Carregando linhas={3} />;

  const alterado = JSON.stringify(valores) !== JSON.stringify(q.data.permissoes);
  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <div className="card-head">
        <div>
          <h2>Perfil Laboratório</h2>
          <p className="muted">O que o técnico do laboratório pode fazer além do básico.</p>
        </div>
      </div>
      <div className="stack">
        {Object.keys(valores).map((chave) => (
          <label key={chave} className="check" style={{ alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={valores[chave]}
              onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.checked }))}
            />
            <span>
              <strong>{ROTULOS[chave]?.titulo ?? chave}</strong>
              <br />
              <span className="muted">{ROTULOS[chave]?.dica}</span>
            </span>
          </label>
        ))}
        <div>
          <Button
            disabled={!alterado}
            carregando={salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            Salvar permissões
          </Button>
        </div>
      </div>
    </div>
  );
}
