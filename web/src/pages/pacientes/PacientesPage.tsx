import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import { podeCadastrarPaciente } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { ErroCarga, Carregando, Vazio } from '../../components/Feedback';
import { Paginacao } from '../../components/Paginacao';
import { fmtDataBR } from '../../lib/datas';
import { PacienteForm } from './PacienteForm';

const LIMITE = 15;

export function PacientesPage() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [ativo, setAtivo] = useState<'true' | 'todos'>('true');
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(busca.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['pacientes', termo, ativo, pagina],
    queryFn: () =>
      // Com termo, a busca vai no corpo (POST): um CPF nunca aparece na URL.
      termo
        ? chamar(
            api.POST('/pacientes/buscar', {
              body: { busca: termo, ativo, pagina, limite: LIMITE },
            }),
          )
        : chamar(api.GET('/pacientes', { params: { query: { ativo, pagina, limite: LIMITE } } })),
    placeholderData: (anterior) => anterior,
  });

  const pode = usuario ? podeCadastrarPaciente(usuario.perfil) : false;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pacientes</h1>
          <p>Busque por nome, celular ou CPF completo. CPF e celular aparecem mascarados.</p>
        </div>
        {pode && <Button onClick={() => setNovo(true)}>Novo paciente</Button>}
      </div>

      <div className="toolbar">
        <div className="grow">
          <label className="sr-only" htmlFor="busca-pac">
            Buscar paciente
          </label>
          <input
            id="busca-pac"
            className="input"
            type="search"
            placeholder="Buscar por nome, celular ou CPF"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={ativo === 'todos'}
            onChange={(e) => {
              setAtivo(e.target.checked ? 'todos' : 'true');
              setPagina(1);
            }}
          />
          Incluir inativos
        </label>
      </div>

      {error ? (
        <ErroCarga erro={error} onTentar={() => refetch()} />
      ) : isLoading ? (
        <Carregando linhas={6} />
      ) : !data?.itens.length ? (
        <div className="card">
          <Vazio titulo={termo ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}>
            {termo
              ? 'Confira a grafia ou tente buscar pelo celular.'
              : pode
                ? 'Cadastre o primeiro paciente.'
                : ''}
          </Vazio>
        </div>
      ) : (
        <>
          <div className="table-wrap" aria-busy={isFetching}>
            <table className="table empilha">
              <thead>
                <tr>
                  <th>Prontuário</th>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Celular</th>
                  <th>Nascimento</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.itens.map((p) => (
                  <tr key={p.id} className="clicavel" onClick={() => navegar(`/pacientes/${p.id}`)}>
                    <td className="mono" data-rotulo="Prontuário">
                      #{p.numero_prontuario}
                    </td>
                    <td data-rotulo="Nome">
                      <a
                        href={`/pacientes/${p.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navegar(`/pacientes/${p.id}`);
                        }}
                      >
                        <strong>{p.nome}</strong>
                      </a>
                    </td>
                    <td className="mono" data-rotulo="CPF">
                      {p.cpf ?? <span className="muted">Sem CPF</span>}
                    </td>
                    <td className="mono" data-rotulo="Celular">
                      {p.celular ?? '—'}
                    </td>
                    <td data-rotulo="Nascimento">{p.nascimento ? fmtDataBR(p.nascimento) : '—'}</td>
                    <td data-rotulo="Situação">
                      <span className={`badge ${p.ativo ? 'badge-ok' : ''}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} limite={LIMITE} total={data.total} onMudar={setPagina} />
        </>
      )}

      {novo && (
        <PacienteForm
          onFechar={() => setNovo(false)}
          aoSalvar={(id) => navegar(`/pacientes/${id}`)}
        />
      )}
    </div>
  );
}
