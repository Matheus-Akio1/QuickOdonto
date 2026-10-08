import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Perfil, Usuario } from '../../api/types';
import { NOME_PERFIL } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { ErroCarga, Carregando, Vazio } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { Paginacao } from '../../components/Paginacao';
import { StatusUsuario } from '../../components/StatusBadge';
import { fmtDataHoraCompleta } from '../../lib/datas';
import { useToast } from '../../toast/useToast';

const PERFIS: Record<'clinica' | 'laboratorio', Perfil[]> = {
  clinica: ['secretaria', 'clinica', 'adm_clinica'],
  laboratorio: ['laboratorio', 'adm_laboratorio'],
};
const LIMITE = 12;

export function UsuariosTab({ unidade }: { unidade: 'clinica' | 'laboratorio' }) {
  const { usuario: eu } = useAuth();
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState<Usuario | 'novo' | null>(null);

  const lista = useQuery({
    queryKey: ['usuarios', busca, pagina],
    queryFn: () =>
      chamar(
        api.GET('/usuarios', {
          params: { query: { busca: busca.trim() || undefined, pagina, limite: LIMITE } },
        }),
      ),
    placeholderData: (a) => a,
  });

  const acao = useMutation({
    mutationFn: async ({
      id,
      tipo,
    }: {
      id: string;
      tipo: 'bloquear' | 'desbloquear' | 'redefinir';
    }) => {
      if (tipo === 'redefinir') {
        await chamar(api.POST('/usuarios/{id}/redefinir-senha', { params: { path: { id } } }));
        return 'E-mail com o link enviado.';
      }
      await chamar(api.POST(`/usuarios/{id}/${tipo}`, { params: { path: { id } } }));
      return tipo === 'bloquear' ? 'Usuário bloqueado e sessões encerradas.' : 'Usuário reativado.';
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      avisar(msg, 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  return (
    <div>
      <div className="toolbar">
        <div className="grow">
          <label className="sr-only" htmlFor="busca-user">
            Buscar usuário
          </label>
          <input
            id="busca-user"
            className="input"
            type="search"
            placeholder="Buscar por nome ou e-mail"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
          />
        </div>
        <Button onClick={() => setForm('novo')}>Novo usuário</Button>
      </div>

      {lista.error ? (
        <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />
      ) : lista.isLoading ? (
        <Carregando linhas={5} />
      ) : !lista.data?.itens.length ? (
        <div className="card">
          <Vazio titulo="Nenhum usuário encontrado" />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table empilha">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil</th>
                  <th>Situação</th>
                  <th>Último acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.data.itens.map((u) => (
                  <tr key={u.id}>
                    <td data-rotulo="Nome">
                      <strong>{u.nome}</strong>
                      <div className="muted">{u.email}</div>
                    </td>
                    <td data-rotulo="Perfil">{NOME_PERFIL[u.perfil]}</td>
                    <td data-rotulo="Situação">
                      <StatusUsuario status={u.status} />
                    </td>
                    <td data-rotulo="Último acesso">{fmtDataHoraCompleta(u.ultimo_acesso)}</td>
                    <td className="acoes">
                      <Button variante="ghost" pequeno onClick={() => setForm(u)}>
                        Editar
                      </Button>
                      {u.status === 'bloqueado' ? (
                        <Button
                          variante="ghost"
                          pequeno
                          onClick={() => acao.mutate({ id: u.id, tipo: 'desbloquear' })}
                        >
                          Desbloquear
                        </Button>
                      ) : (
                        <>
                          {u.id !== eu?.id && (
                            <Button
                              variante="ghost"
                              pequeno
                              onClick={() => acao.mutate({ id: u.id, tipo: 'bloquear' })}
                            >
                              Bloquear
                            </Button>
                          )}
                          <Button
                            variante="ghost"
                            pequeno
                            onClick={() => acao.mutate({ id: u.id, tipo: 'redefinir' })}
                          >
                            {u.status === 'convidado' ? 'Reenviar convite' : 'Redefinir senha'}
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} limite={LIMITE} total={lista.data.total} onMudar={setPagina} />
        </>
      )}

      {form && (
        <UsuarioForm
          usuario={form === 'novo' ? undefined : form}
          perfis={PERFIS[unidade]}
          souEu={form !== 'novo' && form.id === eu?.id}
          onFechar={() => setForm(null)}
        />
      )}
    </div>
  );
}

const schema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  perfil: z.string().min(1, 'Escolha o perfil.'),
});

function UsuarioForm({
  usuario,
  perfis,
  souEu,
  onFechar,
}: {
  usuario?: Usuario;
  perfis: Perfil[];
  souEu: boolean;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: usuario?.nome ?? '',
      email: usuario?.email ?? '',
      perfil: usuario?.perfil ?? perfis[0],
    },
  });

  const salvar = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => {
      const body = { nome: d.nome.trim(), email: d.email, perfil: d.perfil as Perfil };
      return usuario
        ? chamar(api.PATCH('/usuarios/{id}', { params: { path: { id: usuario.id } }, body }))
        : chamar(api.POST('/usuarios', { body }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      avisar(
        usuario ? 'Usuário atualizado.' : 'Usuário criado. O convite foi enviado por e-mail.',
        'ok',
      );
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo={usuario ? 'Editar usuário' : 'Novo usuário'}
      descricao={usuario ? undefined : 'A pessoa recebe um e-mail para definir a própria senha.'}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-usuario" carregando={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="form-usuario"
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
        <Campo label="Nome" erro={errors.nome?.message}>
          {(p) => <input {...p} {...register('nome')} className="input" />}
        </Campo>
        <Campo label="E-mail" erro={errors.email?.message}>
          {(p) => <input {...p} {...register('email')} type="email" className="input" />}
        </Campo>
        <Campo
          label="Perfil"
          erro={errors.perfil?.message}
          dica={souEu ? 'Você não pode alterar o seu próprio perfil.' : undefined}
        >
          {(p) => (
            <select {...p} {...register('perfil')} className="select" disabled={souEu}>
              {perfis.map((pf) => (
                <option key={pf} value={pf}>
                  {NOME_PERFIL[pf]}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </form>
    </Overlay>
  );
}
