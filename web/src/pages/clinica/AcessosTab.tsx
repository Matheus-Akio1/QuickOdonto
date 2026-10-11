import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, chamar } from '../../api/client';
import type { Perfil } from '../../api/types';
import { NOME_PERFIL } from '../../auth/permissoes';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { Paginacao } from '../../components/Paginacao';
import { fmtDataHora } from '../../lib/datas';

const LIMITE = 20;
const RECURSO: Record<string, string> = {
  prontuario: 'Resumo do prontuário',
  anamneses: 'Lista de anamneses',
  anamnese: 'Anamnese',
  evolucoes: 'Evoluções',
  procedimentos: 'Procedimentos',
  odontograma: 'Odontograma',
  planos: 'Planos de tratamento',
  plano: 'Plano de tratamento',
  anexos: 'Lista de anexos',
  anexo_link: 'Abriu anexo',
  anexo_download: 'Baixou anexo',
  pdf_solicitado: 'Solicitou PDF',
  pdf: 'Baixou PDF',
};

/** Quem abriu o prontuário (RF-CLI-015). Também visível para a administração da clínica. */
export function AcessosTab({ pacienteId }: { pacienteId: string }) {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ['acessos', pacienteId, pagina],
    queryFn: () =>
      chamar(
        api.GET('/pacientes/{id}/acessos', {
          params: { path: { id: pacienteId }, query: { pagina, limite: LIMITE } },
        }),
      ),
    gcTime: 0,
  });
  if (q.error) return <ErroCarga erro={q.error} onTentar={() => q.refetch()} />;
  if (!q.data) return <Carregando />;
  if (!q.data.itens.length) {
    return (
      <div className="card">
        <Vazio titulo="Nenhum acesso registrado" />
      </div>
    );
  }
  return (
    <>
      <div className="table-wrap">
        <table className="table empilha">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>O quê</th>
            </tr>
          </thead>
          <tbody>
            {q.data.itens.map((a, i) => (
              <tr key={i}>
                <td data-rotulo="Quando">{fmtDataHora(a.em)}</td>
                <td data-rotulo="Quem">
                  {a.usuario_nome ?? '—'}
                  {a.usuario_perfil && (
                    <span className="muted">
                      {' '}
                      · {NOME_PERFIL[a.usuario_perfil as Perfil] ?? a.usuario_perfil}
                    </span>
                  )}
                </td>
                <td data-rotulo="O quê">{RECURSO[a.recurso] ?? a.recurso}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={pagina} limite={LIMITE} total={q.data.total} onMudar={setPagina} />
    </>
  );
}
