import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { ItemCatalogo } from '../../api/types';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { fmtMoeda } from '../../lib/moeda';
import { useToast } from '../../toast/useToast';

/** Catálogo de procedimentos: usado pelo dentista e pela administração da clínica. */
export function CatalogoProcedimentos() {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<ItemCatalogo | 'novo' | null>(null);

  const lista = useQuery({
    queryKey: ['catalogo', 'todos', busca],
    queryFn: () =>
      chamar(
        api.GET('/procedimentos', {
          params: { query: { ativo: 'todos', busca: busca.trim() || undefined } },
        }),
      ),
    placeholderData: (a) => a,
  });

  const alternar = useMutation({
    mutationFn: (c: ItemCatalogo) =>
      chamar(
        api.PATCH('/procedimentos/{id}', {
          params: { path: { id: c.id } },
          body: { ativo: !c.ativo },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogo'] });
      avisar('Catálogo atualizado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  return (
    <div>
      <div className="toolbar">
        <div className="grow">
          <label className="sr-only" htmlFor="busca-cat">
            Buscar procedimento
          </label>
          <input
            id="busca-cat"
            className="input"
            type="search"
            placeholder="Buscar por nome ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Button onClick={() => setForm('novo')}>Novo procedimento</Button>
      </div>
      {lista.error ? (
        <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />
      ) : !lista.data ? (
        <Carregando />
      ) : !lista.data.length ? (
        <div className="card">
          <Vazio titulo="Nenhum procedimento encontrado" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table empilha">
            <thead>
              <tr>
                <th>Código</th>
                <th>Procedimento</th>
                <th>Especialidade</th>
                <th>Duração</th>
                <th style={{ textAlign: 'right' }}>Valor padrão</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.data.map((c) => (
                <tr key={c.id}>
                  <td className="mono" data-rotulo="Código">
                    {c.codigo}
                  </td>
                  <td data-rotulo="Procedimento">
                    <strong>{c.nome}</strong>
                  </td>
                  <td data-rotulo="Especialidade">{c.especialidade ?? '—'}</td>
                  <td data-rotulo="Duração">{c.duracao_min} min</td>
                  <td className="mono" data-rotulo="Valor padrão" style={{ textAlign: 'right' }}>
                    {fmtMoeda(c.valor_padrao)}
                  </td>
                  <td data-rotulo="Situação">
                    <span className={`badge ${c.ativo ? 'badge-ok' : ''}`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="acoes">
                    <Button variante="ghost" pequeno onClick={() => setForm(c)}>
                      Editar
                    </Button>
                    <Button variante="ghost" pequeno onClick={() => alternar.mutate(c)}>
                      {c.ativo ? 'Inativar' : 'Reativar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <FormCatalogo item={form === 'novo' ? undefined : form} onFechar={() => setForm(null)} />
      )}
    </div>
  );
}

const schema = z.object({
  codigo: z.string().trim().min(1, 'Informe o código.').max(20),
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  especialidade: z.string().trim().max(60),
  duracao_min: z.coerce.number().int().min(5, 'Mínimo 5 min.').max(480),
  valor_padrao: z
    .string()
    .refine((v) => /^\d+([.,]\d{1,2})?$/.test(v.trim()), 'Valor inválido (ex.: 220,00).'),
});
type Form = z.input<typeof schema>;

function FormCatalogo({ item, onFechar }: { item?: ItemCatalogo; onFechar: () => void }) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      codigo: item?.codigo ?? '',
      nome: item?.nome ?? '',
      especialidade: item?.especialidade ?? '',
      duracao_min: item?.duracao_min ?? 30,
      valor_padrao: item ? String(item.valor_padrao).replace('.', ',') : '0',
    },
  });

  const salvar = useMutation({
    mutationFn: (d: z.output<typeof schema>) => {
      const body = {
        codigo: d.codigo,
        nome: d.nome,
        especialidade: d.especialidade || null,
        duracao_min: d.duracao_min,
        valor_padrao: Number(d.valor_padrao.trim().replace(',', '.')),
      };
      return item
        ? chamar(api.PATCH('/procedimentos/{id}', { params: { path: { id: item.id } }, body }))
        : chamar(api.POST('/procedimentos', { body }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogo'] });
      avisar(item ? 'Procedimento atualizado.' : 'Procedimento cadastrado.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo={item ? 'Editar procedimento' : 'Novo procedimento'}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-catalogo" carregando={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="form-catalogo"
        className="stack"
        noValidate
        onSubmit={handleSubmit((d) => {
          setErro(null);
          salvar.mutate(d);
        })}
      >
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <div className="form-grid">
          <Campo label="Código" erro={errors.codigo?.message}>
            {(p) => <input {...p} {...register('codigo')} className="input" />}
          </Campo>
          <Campo label="Duração (min)" erro={errors.duracao_min?.message}>
            {(p) => (
              <input
                {...p}
                {...register('duracao_min')}
                className="input"
                type="number"
                min={5}
                max={480}
              />
            )}
          </Campo>
          <Campo className="full" label="Nome" erro={errors.nome?.message}>
            {(p) => <input {...p} {...register('nome')} className="input" />}
          </Campo>
          <Campo label="Especialidade">
            {(p) => <input {...p} {...register('especialidade')} className="input" />}
          </Campo>
          <Campo label="Valor padrão (R$)" erro={errors.valor_padrao?.message}>
            {(p) => (
              <input {...p} {...register('valor_padrao')} className="input" inputMode="decimal" />
            )}
          </Campo>
        </div>
      </form>
    </Overlay>
  );
}
