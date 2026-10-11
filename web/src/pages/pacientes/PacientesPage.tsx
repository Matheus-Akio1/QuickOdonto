import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Paciente, PacienteFicha } from '../../api/types';
import { NOME_PAINEL, podeAgendar, podeCadastrarPaciente } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/Avatar';
import { Chip } from '../../components/Chip';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import {
  IconeAbrirFicha,
  IconeBaixar,
  IconeEditar,
  IconeMais,
  IconePessoa,
  IconeReagendar,
  IconeRelogio,
  IconeSetaDireita,
} from '../../components/Icones';
import { Paginacao } from '../../components/Paginacao';
import { Seg } from '../../components/Seg';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { dataDe, fmtDataCurta, fmtHora, hoje, nomeDia } from '../../lib/datas';
import { idade, prontuario5 } from '../../lib/pessoa';
import { useCelular } from '../../lib/useCelular';
import { useToast } from '../../toast/useToast';
import { PacienteForm } from './PacienteForm';

const LIMITE = 8;
type Filtro = 'consulta_hoje' | 'sem_retorno' | 'menores';
const COLUNAS = 'minmax(260px,1.7fr) 92px 100px 150px minmax(190px,1fr) 96px';
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PacientesPage() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const celular = useCelular();
  const { avisar } = useToast();
  const local = useLocation();
  const [busca, setBusca] = useState((local.state as { busca?: string } | null)?.busca ?? '');
  const [termo, setTermo] = useState('');
  const [ativo, setAtivo] = useState<'true' | 'false'>('true');
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState<PacienteFicha | 'novo' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(busca.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['pacientes', termo, ativo, filtro, pagina],
    queryFn: () =>
      // Com termo, a busca vai no corpo (POST): um CPF nunca aparece na URL.
      termo
        ? chamar(
            api.POST('/pacientes/buscar', {
              body: { busca: termo, ativo, filtro: filtro ?? undefined, pagina, limite: LIMITE },
            }),
          )
        : chamar(
            api.GET('/pacientes', {
              params: { query: { ativo, filtro: filtro ?? undefined, pagina, limite: LIMITE } },
            }),
          ),
    placeholderData: (anterior) => anterior,
  });

  // Editar exige a ficha completa (endereço e observações não vêm na lista).
  const abrirEdicao = useMutation({
    mutationFn: (id: string) => chamar(api.GET('/pacientes/{id}', { params: { path: { id } } })),
    onSuccess: setForm,
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  if (!usuario) return null;
  const escreve = podeCadastrarPaciente(usuario.perfil);
  const agenda = podeAgendar(usuario.perfil);
  const alternar = (f: Filtro) => {
    setFiltro((atual) => (atual === f ? null : f));
    setPagina(1);
  };

  const proxima = (p: Paciente) => {
    const pc = p.proxima_consulta;
    if (!pc) {
      return agenda && p.ativo ? (
        <Link
          className="btn xs"
          style={{ background: '#FFF6EC', borderColor: '#F3D9BE', color: 'var(--laranja-ink)' }}
          to={`/agenda?novaConsulta=${p.id}`}
        >
          <IconeMais tamanho={14} />
          Agendar retorno
        </Link>
      ) : (
        <span className="muted" style={{ fontSize: 13 }}>
          Sem retorno agendado
        </span>
      );
    }
    if (pc.status === 'em_atendimento') {
      return (
        <span className="badge b-info">
          <span className="pulse" style={{ width: 6, height: 6, boxShadow: 'none' }} />
          Em atendimento
        </span>
      );
    }
    const dia = dataDe(pc.inicio);
    if (dia === hoje()) {
      return (
        <span className="badge b-cor">
          <IconeRelogio tamanho={13} />
          Hoje · {fmtHora(pc.inicio)}
        </span>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {maiuscula(nomeDia(dia))}, {fmtDataCurta(dia)}
        </span>
        <span className="num muted" style={{ fontSize: 13 }}>
          {fmtHora(pc.inicio)}
        </span>
      </div>
    );
  };

  const anos = (p: Paciente) => idade(p.nascimento);
  const menor = (p: Paciente) => {
    const a = anos(p);
    return a !== null && a < 18;
  };

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[usuario.perfil]} / Pacientes`} titulo="Pacientes">
        <BuscaCabecalho valor={busca} onMudar={setBusca} placeholder="Nome, CPF ou celular" />
        {escreve && (
          <>
            <a className="btn" href="/api/v1/pacientes/exportar?formato=xlsx" download>
              <IconeBaixar />
              Exportar
            </a>
            <button type="button" className="btn pri" onClick={() => setForm('novo')}>
              <IconeMais />
              Novo paciente
            </button>
          </>
        )}
      </Cabecalho>

      <div className="content">
        <div className="row" style={{ gap: 10, minHeight: 44 }}>
          <Seg
            rotulo="Situação"
            valor={ativo}
            onMudar={(v) => {
              setAtivo(v);
              setPagina(1);
            }}
            opcoes={[
              { valor: 'true', rotulo: 'Ativos' },
              { valor: 'false', rotulo: 'Inativos' },
            ]}
          />
          <span
            style={{ width: 1, height: 24, background: 'var(--line-strong)', margin: '0 4px' }}
          />
          <Chip ativo={filtro === 'consulta_hoje'} onClick={() => alternar('consulta_hoje')}>
            <IconeRelogio tamanho={15} />
            Consulta hoje
          </Chip>
          <Chip ativo={filtro === 'sem_retorno'} onClick={() => alternar('sem_retorno')}>
            <IconeReagendar tamanho={15} />
            Sem retorno agendado
          </Chip>
          <Chip ativo={filtro === 'menores'} onClick={() => alternar('menores')}>
            <IconePessoa tamanho={15} />
            Menores de idade
          </Chip>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--ink-3)' }}>
            Ordenado por <b style={{ color: 'var(--ink)' }}>nome</b>
          </span>
        </div>

        {error ? (
          <ErroCarga erro={error} onTentar={() => refetch()} />
        ) : isLoading || !data ? (
          <div className="card pad">
            <Carregando linhas={6} />
          </div>
        ) : !data.itens.length ? (
          <div className="card">
            <Vazio
              titulo={termo || filtro ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            >
              {termo
                ? 'Confira a grafia ou tente buscar pelo celular.'
                : filtro
                  ? 'Nenhum paciente neste filtro.'
                  : ''}
            </Vazio>
          </div>
        ) : celular ? (
          <div className="card" style={{ overflow: 'hidden' }} aria-busy={isFetching}>
            {data.itens.map((p) => (
              <Link key={p.id} to={`/pacientes/${p.id}`} className="hover-row lista-movel">
                <Avatar nome={p.nome} tamanho={40} />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    minWidth: 0,
                    flexGrow: 1,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                    {p.nome} {menor(p) && <span className="badge b-mut">Menor</span>}
                  </span>
                  <span className="num muted" style={{ fontSize: 13 }}>
                    {prontuario5(p.numero_prontuario)}
                    {anos(p) !== null ? ` · ${anos(p)} anos` : ''}
                  </span>
                </div>
                {p.proxima_consulta?.status === 'em_atendimento' && (
                  <span className="badge b-info">Na cadeira</span>
                )}
                {p.proxima_consulta &&
                  p.proxima_consulta.status !== 'em_atendimento' &&
                  dataDe(p.proxima_consulta.inicio) === hoje() && (
                    <span className="badge b-cor">Hoje</span>
                  )}
                {!p.proxima_consulta && p.ativo && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--laranja-ink)' }}>
                    Sem retorno
                  </span>
                )}
                <span className="muted">
                  <IconeSetaDireita tamanho={16} />
                </span>
              </Link>
            ))}
            <Paginacao
              pagina={pagina}
              limite={LIMITE}
              total={data.total}
              onMudar={setPagina}
              nome="pacientes"
            />
          </div>
        ) : (
          <div
            className="card"
            style={{ overflow: 'hidden' }}
            role="table"
            aria-label="Pacientes"
            aria-busy={isFetching}
          >
            <div className="lista-cab" role="row" style={{ gridTemplateColumns: COLUNAS }}>
              <span className="th" role="columnheader">
                Paciente
              </span>
              <span className="th" role="columnheader">
                Prontuário
              </span>
              <span className="th" role="columnheader">
                Idade
              </span>
              <span className="th" role="columnheader">
                Celular
              </span>
              <span className="th" role="columnheader">
                Próxima consulta
              </span>
              <span className="th" role="columnheader" style={{ textAlign: 'right' }}>
                Ações
              </span>
            </div>
            {data.itens.map((p) => (
              <div
                key={p.id}
                className="lista-linha hover-row"
                role="row"
                style={{ gridTemplateColumns: COLUNAS }}
              >
                <div
                  role="cell"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}
                >
                  <Avatar nome={p.nome} tamanho={40} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link
                        to={`/pacientes/${p.id}`}
                        style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}
                      >
                        {p.nome}
                      </Link>
                      {menor(p) && <span className="badge b-mut">Menor de idade</span>}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--ink-3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.email ?? 'Sem e-mail cadastrado'}
                    </span>
                  </div>
                </div>
                <span className="num" role="cell">
                  {prontuario5(p.numero_prontuario)}
                </span>
                <span className="num" role="cell">
                  {anos(p) !== null ? `${anos(p)} anos` : '—'}
                </span>
                <span className="num" role="cell" style={{ whiteSpace: 'nowrap' }}>
                  {p.celular ??
                    (escreve ? (
                      <button
                        type="button"
                        className="link-acao"
                        onClick={() => abrirEdicao.mutate(p.id)}
                      >
                        Adicionar celular
                      </button>
                    ) : (
                      '—'
                    ))}
                </span>
                <div role="cell">{proxima(p)}</div>
                <div role="cell" style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                  {escreve && (
                    <button
                      type="button"
                      className="ibtn g"
                      aria-label={`Editar ${p.nome}`}
                      onClick={() => abrirEdicao.mutate(p.id)}
                    >
                      <IconeEditar />
                    </button>
                  )}
                  <Link
                    className="ibtn g"
                    to={`/pacientes/${p.id}`}
                    aria-label={`Abrir ficha de ${p.nome}`}
                  >
                    <IconeAbrirFicha />
                  </Link>
                </div>
              </div>
            ))}
            <Paginacao
              pagina={pagina}
              limite={LIMITE}
              total={data.total}
              onMudar={setPagina}
              nome="pacientes"
            />
          </div>
        )}
      </div>

      {form && (
        <PacienteForm
          paciente={form === 'novo' ? undefined : form}
          onFechar={() => setForm(null)}
          aoSalvar={(id, agendar) =>
            navegar(agendar ? `/agenda?novaConsulta=${id}` : `/pacientes/${id}`)
          }
        />
      )}
    </>
  );
}
