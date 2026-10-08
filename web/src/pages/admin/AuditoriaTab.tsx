import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api, chamar } from '../../api/client';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Paginacao } from '../../components/Paginacao';
import { fmtDataHora, isoLocal, somarDias } from '../../lib/datas';

const LIMITE = 15;
const ENTIDADES = [
  'usuarios',
  'perfis_permissoes',
  'pacientes',
  'consultas',
  'profissionais',
  'profissional_horarios',
  'bloqueios_agenda',
];

export function AuditoriaTab() {
  const [entidade, setEntidade] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['auditoria', entidade, de, ate, pagina],
    queryFn: () =>
      chamar(
        api.GET('/auditoria', {
          params: {
            query: {
              entidade: entidade || undefined,
              inicio: de ? isoLocal(de, '00:00') : undefined,
              fim: ate ? isoLocal(somarDias(ate, 1), '00:00') : undefined,
              pagina,
              limite: LIMITE,
            },
          },
        }),
      ),
    placeholderData: (a) => a,
  });

  return (
    <div>
      <div className="toolbar">
        <label className="sr-only" htmlFor="aud-ent">
          Entidade
        </label>
        <select
          id="aud-ent"
          className="select"
          style={{ width: 'auto' }}
          value={entidade}
          onChange={(e) => {
            setEntidade(e.target.value);
            setPagina(1);
          }}
        >
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <label className="row">
          De
          <input
            className="input"
            style={{ width: 'auto' }}
            type="date"
            value={de}
            onChange={(e) => {
              setDe(e.target.value);
              setPagina(1);
            }}
          />
        </label>
        <label className="row">
          Até
          <input
            className="input"
            style={{ width: 'auto' }}
            type="date"
            value={ate}
            onChange={(e) => {
              setAte(e.target.value);
              setPagina(1);
            }}
          />
        </label>
      </div>

      {q.error ? (
        <ErroCarga erro={q.error} onTentar={() => q.refetch()} />
      ) : q.isLoading ? (
        <Carregando linhas={6} />
      ) : !q.data?.itens.length ? (
        <div className="card">
          <Vazio titulo="Nenhum registro no período" />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.itens.map((i) => (
                  <Fragment key={i.id}>
                    <tr>
                      <td>{fmtDataHora(i.em)}</td>
                      <td>{i.usuario_nome ?? <span className="muted">sistema</span>}</td>
                      <td>
                        <span className="badge badge-primary">{i.acao}</span>
                      </td>
                      <td>{i.entidade}</td>
                      <td className="acoes">
                        {(i.antes || i.depois) && (
                          <Button
                            variante="ghost"
                            pequeno
                            aria-expanded={aberto === i.id}
                            onClick={() => setAberto(aberto === i.id ? null : i.id)}
                          >
                            {aberto === i.id ? 'Ocultar' : 'Detalhes'}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {aberto === i.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
                          <div className="grid-2">
                            <div>
                              <strong>Antes</strong>
                              <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>
                                {i.antes ? JSON.stringify(i.antes, null, 2) : '—'}
                              </pre>
                            </div>
                            <div>
                              <strong>Depois</strong>
                              <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>
                                {i.depois ? JSON.stringify(i.depois, null, 2) : '—'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} limite={LIMITE} total={q.data.total} onMudar={setPagina} />
        </>
      )}
    </div>
  );
}
