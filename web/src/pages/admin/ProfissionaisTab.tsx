import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Horario, Profissional } from '../../api/types';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../toast/useToast';

export function ProfissionaisTab() {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [novo, setNovo] = useState(false);
  const [jornada, setJornada] = useState<Profissional | null>(null);

  const lista = useQuery({
    queryKey: ['profissionais', 'todos'],
    queryFn: () => chamar(api.GET('/profissionais', { params: { query: { todos: true } } })),
  });

  const alternar = useMutation({
    mutationFn: (p: Profissional) =>
      chamar(
        api.PATCH('/profissionais/{id}', {
          params: { path: { id: p.id } },
          body: { ativo: !p.ativo },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] });
      avisar('Situação do profissional atualizada.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  return (
    <div>
      <div className="toolbar">
        <div className="grow" />
        <Button onClick={() => setNovo(true)}>Novo profissional</Button>
      </div>
      {lista.error ? (
        <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />
      ) : !lista.data ? (
        <Carregando linhas={3} />
      ) : lista.data.length === 0 ? (
        <div className="card">
          <Vazio titulo="Nenhum profissional cadastrado">
            Cadastre os dentistas para liberar a agenda.
          </Vazio>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table empilha">
            <thead>
              <tr>
                <th>Profissional</th>
                <th>CRO</th>
                <th>Especialidade</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.data.map((p) => (
                <tr key={p.id}>
                  <td data-rotulo="Profissional">
                    <span className="row">
                      <span
                        aria-hidden="true"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: p.cor_agenda,
                          display: 'inline-block',
                        }}
                      />
                      <strong>{p.nome}</strong>
                    </span>
                  </td>
                  <td className="mono" data-rotulo="CRO">
                    {p.cro}
                  </td>
                  <td data-rotulo="Especialidade">{p.especialidade ?? '—'}</td>
                  <td data-rotulo="Situação">
                    <span className={`badge ${p.ativo ? 'badge-ok' : ''}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="acoes">
                    <Button variante="ghost" pequeno onClick={() => setJornada(p)}>
                      Jornada
                    </Button>
                    <Button variante="ghost" pequeno onClick={() => alternar.mutate(p)}>
                      {p.ativo ? 'Inativar' : 'Reativar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {novo && <NovoProfissional existentes={lista.data ?? []} onFechar={() => setNovo(false)} />}
      {jornada && <JornadaDialog profissional={jornada} onFechar={() => setJornada(null)} />}
    </div>
  );
}

const schema = z.object({
  usuario_id: z.string().min(1, 'Escolha o usuário.'),
  cro: z.string().trim().min(3, 'Informe o CRO.').max(20),
  especialidade: z.string().max(60),
  cor_agenda: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

function NovoProfissional({
  existentes,
  onFechar,
}: {
  existentes: Profissional[];
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const usuarios = useQuery({
    queryKey: ['usuarios', 'dentistas'],
    queryFn: () => chamar(api.GET('/usuarios', { params: { query: { limite: 100 } } })),
  });
  const candidatos = (usuarios.data?.itens ?? []).filter(
    (u) =>
      u.perfil === 'clinica' &&
      u.status !== 'bloqueado' &&
      !existentes.some((p) => p.usuario_id === u.id),
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { usuario_id: '', cro: '', especialidade: '', cor_agenda: '#1a6b5e' },
  });

  const salvar = useMutation({
    mutationFn: (d: z.infer<typeof schema>) =>
      chamar(
        api.POST('/profissionais', {
          body: {
            usuario_id: d.usuario_id,
            cro: d.cro.trim(),
            especialidade: d.especialidade.trim() || null,
            cor_agenda: d.cor_agenda,
          },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] });
      avisar('Profissional cadastrado. Defina a jornada para liberar a agenda.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo="Novo profissional"
      descricao="Escolha um usuário com perfil Dentista."
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-prof" carregando={salvar.isPending}>
            Cadastrar
          </Button>
        </>
      }
    >
      <form
        id="form-prof"
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
        <Campo
          label="Usuário"
          erro={errors.usuario_id?.message}
          dica={
            !candidatos.length && usuarios.data
              ? 'Nenhum dentista disponível: crie um usuário com perfil Dentista na aba Usuários.'
              : undefined
          }
        >
          {(p) => (
            <select {...p} {...register('usuario_id')} className="select">
              <option value="">Selecione…</option>
              {candidatos.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} — {u.email}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <div className="form-grid">
          <Campo label="CRO" erro={errors.cro?.message}>
            {(p) => (
              <input {...p} {...register('cro')} className="input" placeholder="CRO-SP 12345" />
            )}
          </Campo>
          <Campo label="Especialidade">
            {(p) => <input {...p} {...register('especialidade')} className="input" />}
          </Campo>
          <Campo label="Cor na agenda">
            {(p) => (
              <input
                {...p}
                {...register('cor_agenda')}
                type="color"
                className="input"
                style={{ padding: 4 }}
              />
            )}
          </Campo>
        </div>
      </form>
    </Overlay>
  );
}

const DIAS = [
  { dia: 1, nome: 'Segunda' },
  { dia: 2, nome: 'Terça' },
  { dia: 3, nome: 'Quarta' },
  { dia: 4, nome: 'Quinta' },
  { dia: 5, nome: 'Sexta' },
  { dia: 6, nome: 'Sábado' },
  { dia: 0, nome: 'Domingo' },
];

function JornadaDialog({
  profissional,
  onFechar,
}: {
  profissional: Profissional;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [janelas, setJanelas] = useState<Horario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['horarios', profissional.id, 'edicao'],
    queryFn: async () => {
      const r = await chamar(
        api.GET('/profissionais/{id}/horarios', { params: { path: { id: profissional.id } } }),
      );
      setJanelas(r.horarios);
      return r;
    },
    staleTime: 0,
  });

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        api.PUT('/profissionais/{id}/horarios', {
          params: { path: { id: profissional.id } },
          body: { horarios: janelas ?? [] },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['horarios'] });
      avisar('Jornada salva.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const lista = janelas ?? [];
  const alterar = (idx: number, parcial: Partial<Horario>) =>
    setJanelas(lista.map((j, i) => (i === idx ? { ...j, ...parcial } : j)));
  const padrao = () =>
    setJanelas(
      [1, 2, 3, 4, 5].flatMap((dia_semana) => [
        { dia_semana, inicio: '08:00', fim: '12:00' },
        { dia_semana, inicio: '14:00', fim: '18:00' },
      ]),
    );

  return (
    <Overlay
      titulo={`Jornada — ${profissional.nome}`}
      descricao="Horários em que o profissional atende. Fora deles a agenda não aceita consultas."
      onFechar={onFechar}
      largo
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            carregando={salvar.isPending}
            disabled={janelas === null}
            onClick={() => {
              setErro(null);
              salvar.mutate();
            }}
          >
            Salvar jornada
          </Button>
        </>
      }
    >
      {q.error ? (
        <ErroCarga erro={q.error} />
      ) : janelas === null ? (
        <Carregando linhas={3} />
      ) : (
        <div className="stack">
          {erro && (
            <div className="alert" role="alert">
              {erro}
            </div>
          )}
          <div>
            <Button variante="secondary" pequeno onClick={padrao}>
              Preencher seg–sex, 08–12 e 14–18
            </Button>
          </div>
          {DIAS.map(({ dia, nome }) => {
            const doDia = lista
              .map((j, idx) => ({ j, idx }))
              .filter(({ j }) => j.dia_semana === dia);
            return (
              <div key={dia} className="row" style={{ alignItems: 'flex-start' }}>
                <strong style={{ width: 84, paddingTop: 10 }}>{nome}</strong>
                <div className="stack" style={{ gap: 8, flex: 1 }}>
                  {doDia.length === 0 && (
                    <span className="muted" style={{ paddingTop: 10 }}>
                      Sem atendimento
                    </span>
                  )}
                  {doDia.map(({ j, idx }) => (
                    <div key={idx} className="row">
                      <input
                        aria-label={`${nome}: início`}
                        className="input"
                        style={{ width: 130 }}
                        type="time"
                        value={j.inicio}
                        onChange={(e) => alterar(idx, { inicio: e.target.value })}
                      />
                      <span>até</span>
                      <input
                        aria-label={`${nome}: fim`}
                        className="input"
                        style={{ width: 130 }}
                        type="time"
                        value={j.fim}
                        onChange={(e) => alterar(idx, { fim: e.target.value })}
                      />
                      <Button
                        variante="ghost"
                        pequeno
                        aria-label={`Remover janela de ${nome}`}
                        onClick={() => setJanelas(lista.filter((_, i) => i !== idx))}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      variante="ghost"
                      pequeno
                      onClick={() =>
                        setJanelas([...lista, { dia_semana: dia, inicio: '08:00', fim: '12:00' }])
                      }
                    >
                      + Adicionar janela
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}
