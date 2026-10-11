import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, chamar, mensagemDeErro } from '../../api/client';
import {
  NOME_PAINEL,
  podeAgendar,
  podeCadastrarPaciente,
  podeVerProntuario,
} from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { IconeAgenda, IconeEditar, IconePasta } from '../../components/Icones';
import { Cabecalho } from '../../layout/Cabecalho';
import { idade } from '../../lib/pessoa';
import { Campo } from '../../components/Campo';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { StatusConsulta } from '../../components/StatusBadge';
import { fmtDataBR, fmtDataHora } from '../../lib/datas';
import { mascaraCelular, mascaraCpf } from '../../lib/mascaras';
import { useToast } from '../../toast/useToast';
import { PacienteForm } from './PacienteForm';

type CampoRevelavel = 'cpf' | 'celular' | 'responsavel_celular';
const TEMPO_REVELADO_MS = 20_000;

const FORMAS = {
  presencial: 'Presencial',
  digital: 'Digital',
  termo_assinado: 'Termo assinado',
} as const;

export function FichaPage() {
  const { id = '' } = useParams();
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [consentindo, setConsentindo] = useState(false);
  const [revelados, setRevelados] = useState<Partial<Record<CampoRevelavel, string>>>({});
  const timers = useRef<Partial<Record<CampoRevelavel, ReturnType<typeof setTimeout>>>>({});

  const ficha = useQuery({
    queryKey: ['paciente', id],
    queryFn: () => chamar(api.GET('/pacientes/{id}', { params: { path: { id } } })),
  });
  const resumo = useQuery({
    queryKey: ['paciente', id, 'resumo'],
    queryFn: () => chamar(api.GET('/pacientes/{id}/resumo', { params: { path: { id } } })),
  });

  // O valor revelado vive só no estado desta tela e some sozinho (ou ao sair dela).
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => x && clearTimeout(x));
  }, []);

  const revelar = useMutation({
    mutationFn: (campo: CampoRevelavel) =>
      chamar(api.GET('/pacientes/{id}/revelar/{campo}', { params: { path: { id, campo } } })),
    onSuccess: ({ campo, valor }) => {
      const k = campo as CampoRevelavel;
      setRevelados((r) => ({ ...r, [k]: valor ?? '' }));
      clearTimeout(timers.current[k]);
      timers.current[k] = setTimeout(
        () => setRevelados((r) => Object.fromEntries(Object.entries(r).filter(([c]) => c !== k))),
        TEMPO_REVELADO_MS,
      );
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  const remover = useMutation({
    mutationFn: () => chamar(api.DELETE('/pacientes/{id}', { params: { path: { id } } })),
    onSuccess: ({ acao }) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] });
      avisar(
        acao === 'inativado' ? 'Paciente inativado (possui histórico).' : 'Paciente excluído.',
        'ok',
      );
      navegar('/pacientes', { replace: true });
    },
    onError: (e) => {
      setRemovendo(false);
      avisar(mensagemDeErro(e), 'erro');
    },
  });

  if (ficha.error)
    return (
      <div className="content" style={{ paddingTop: 28 }}>
        <ErroCarga erro={ficha.error} onTentar={() => ficha.refetch()} />
      </div>
    );
  if (!ficha.data || !usuario)
    return (
      <div className="content" style={{ paddingTop: 28 }}>
        <Carregando />
      </div>
    );

  const p = ficha.data;
  const escreve = podeCadastrarPaciente(usuario.perfil);
  const agenda = podeAgendar(usuario.perfil);

  const valor = (campo: CampoRevelavel, mascarado: string | null | undefined) => {
    if (!mascarado) return <span className="muted">—</span>;
    const aberto = revelados[campo];
    const formatado =
      aberto === undefined
        ? mascarado
        : campo === 'cpf'
          ? mascaraCpf(aberto)
          : mascaraCelular(aberto);
    return (
      <span className="row">
        <span className="mono">{formatado}</span>
        {aberto === undefined ? (
          <Button
            variante="ghost"
            pequeno
            carregando={revelar.isPending && revelar.variables === campo}
            onClick={() => revelar.mutate(campo)}
            aria-label={`Revelar ${campo === 'cpf' ? 'CPF' : 'celular'} (fica registrado na auditoria)`}
          >
            Revelar
          </Button>
        ) : (
          <span className="muted">oculta em 20 s</span>
        )}
      </span>
    );
  };

  const anos = idade(p.nascimento);

  return (
    <>
      <Cabecalho
        trilha={`${NOME_PAINEL[usuario.perfil]} / Pacientes / Ficha`}
        titulo="Ficha do paciente"
      >
        {podeVerProntuario(usuario.perfil) && (
          <Link className="btn pri" to={`/clinica/prontuario/${p.id}`}>
            <IconePasta />
            Abrir prontuário
          </Link>
        )}
        {agenda && p.ativo && (
          <Link className="btn pri" to={`/agenda?novaConsulta=${p.id}`}>
            <IconeAgenda />
            Agendar consulta
          </Link>
        )}
      </Cabecalho>

      <div className="content">
        <div className="card pad row" style={{ gap: 16 }}>
          <Avatar nome={p.nome} tamanho={56} />
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1, minWidth: 0 }}
          >
            <div className="row" style={{ gap: 10 }}>
              <h2
                className="disp"
                style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}
              >
                {p.nome}
              </h2>
              <span className={`badge ${p.ativo ? 'b-ok' : 'b-mut'}`}>
                {p.ativo ? 'Ativo' : 'Inativo'}
              </span>
              {anos !== null && anos < 18 && <span className="badge b-mut">Menor de idade</span>}
            </div>
            <span className="num muted">
              Prontuário {String(p.numero_prontuario).padStart(5, '0')}
              {anos !== null ? ` · ${anos} anos` : ''}
            </span>
          </div>
          {escreve && (
            <div className="row">
              <button type="button" className="btn" onClick={() => setEditando(true)}>
                <IconeEditar />
                Editar
              </button>
              <button type="button" className="btn" onClick={() => setRemovendo(true)}>
                {p.ativo ? 'Inativar / excluir' : 'Excluir'}
              </button>
            </div>
          )}
        </div>

        <div className="grid-2">
          <section className="card pad">
            <div className="card-head">
              <h2 className="h2">Dados pessoais</h2>
            </div>
            <dl className="dl">
              <dt>CPF</dt>
              <dd>{valor('cpf', p.cpf)}</dd>
              <dt>Nascimento</dt>
              <dd>{p.nascimento ? fmtDataBR(p.nascimento) : '—'}</dd>
              <dt>Sexo</dt>
              <dd>
                {p.sexo === 'F'
                  ? 'Feminino'
                  : p.sexo === 'M'
                    ? 'Masculino'
                    : p.sexo === 'O'
                      ? 'Outro'
                      : '—'}
              </dd>
              <dt>Celular</dt>
              <dd>{valor('celular', p.celular)}</dd>
              <dt>E-mail</dt>
              <dd>{p.email ?? '—'}</dd>
              <dt>Origem</dt>
              <dd>{p.origem ?? '—'}</dd>
            </dl>
          </section>

          <section className="card pad">
            <div className="card-head">
              <h2 className="h2">Endereço e responsável</h2>
            </div>
            <dl className="dl">
              <dt>Endereço</dt>
              <dd>
                {p.endereco
                  ? [
                      [p.endereco.logradouro, p.endereco.numero].filter(Boolean).join(', '),
                      p.endereco.complemento,
                      p.endereco.bairro,
                      [p.endereco.cidade, p.endereco.uf].filter(Boolean).join('/'),
                      p.endereco.cep,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : '—'}
              </dd>
              <dt>Responsável</dt>
              <dd>
                {p.responsavel
                  ? `${p.responsavel.nome}${p.responsavel.parentesco ? ` (${p.responsavel.parentesco})` : ''}`
                  : '—'}
              </dd>
              <dt>Cel. responsável</dt>
              <dd>{valor('responsavel_celular', p.responsavel?.celular)}</dd>
              <dt>Observações</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{p.observacoes ?? '—'}</dd>
            </dl>
          </section>

          <section className="card pad">
            <div className="card-head">
              <h2 className="h2">Próximas consultas</h2>
            </div>
            {resumo.isLoading ? (
              <Carregando linhas={2} />
            ) : !resumo.data?.proximas_consultas.length ? (
              <p className="muted">Nenhuma consulta futura.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {resumo.data.proximas_consultas.map((c) => (
                  <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <strong>{fmtDataHora(c.inicio)}</strong>
                      <br />
                      <span className="muted">
                        {c.profissional_nome}
                        {c.procedimento_previsto ? ` · ${c.procedimento_previsto}` : ''}
                      </span>
                    </span>
                    <StatusConsulta status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card pad">
            <div className="card-head">
              <h2 className="h2">Consentimentos LGPD</h2>
              {escreve && (
                <Button variante="secondary" pequeno onClick={() => setConsentindo(true)}>
                  Registrar
                </Button>
              )}
            </div>
            {!p.consentimentos?.length ? (
              <p className="muted">Nenhum consentimento registrado.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {p.consentimentos.map((c) => (
                  <li key={c.id}>
                    <strong>{c.finalidade}</strong>
                    <br />
                    <span className="muted">
                      {FORMAS[c.forma]} · {fmtDataHora(c.data)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editando && <PacienteForm paciente={p} onFechar={() => setEditando(false)} />}
      {consentindo && <ConsentimentoDialog id={id} onFechar={() => setConsentindo(false)} />}
      {removendo && (
        <ConfirmDialog
          titulo={p.ativo ? 'Inativar ou excluir paciente?' : 'Excluir paciente?'}
          confirmar="Confirmar"
          perigo
          carregando={remover.isPending}
          onCancelar={() => setRemovendo(false)}
          onConfirmar={() => remover.mutate()}
        >
          <p>
            Se {p.nome} já tiver histórico (consultas), o cadastro será apenas{' '}
            <strong>inativado</strong>. Sem histórico, ele é <strong>excluído</strong> de vez. A
            ação fica registrada na auditoria.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

const schemaConsent = z.object({
  finalidade: z.string().trim().min(3, 'Descreva a finalidade.').max(200),
  forma: z.enum(['presencial', 'digital', 'termo_assinado']),
});

function ConsentimentoDialog({ id, onFechar }: { id: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schemaConsent>>({
    resolver: zodResolver(schemaConsent),
    defaultValues: { finalidade: 'Tratamento odontológico', forma: 'presencial' },
  });
  const salvar = useMutation({
    mutationFn: (body: z.infer<typeof schemaConsent>) =>
      chamar(api.POST('/pacientes/{id}/consentimento', { params: { path: { id } }, body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paciente', id] });
      avisar('Consentimento registrado.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo="Registrar consentimento"
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-consent" carregando={salvar.isPending}>
            Registrar
          </Button>
        </>
      }
    >
      <form
        id="form-consent"
        className="stack"
        noValidate
        onSubmit={handleSubmit((d) => salvar.mutate(d))}
      >
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <Campo label="Finalidade" erro={errors.finalidade?.message}>
          {(p) => <input {...p} {...register('finalidade')} className="input" />}
        </Campo>
        <Campo label="Forma de coleta">
          {(p) => (
            <select {...p} {...register('forma')} className="select">
              {Object.entries(FORMAS).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </form>
    </Overlay>
  );
}
