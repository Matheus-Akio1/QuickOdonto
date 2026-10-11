import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/Avatar';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { IconeSetaDireita } from '../../components/Icones';
import { StatusConsulta } from '../../components/StatusBadge';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { fmtHora, hoje, isoLocal, somarDias } from '../../lib/datas';
import { prontuario5 } from '../../lib/pessoa';
import { useDebounce } from '../../lib/useDebounce';

const TELA = {
  prontuario: { trilha: 'Clínica / Prontuário', titulo: 'Prontuário do paciente' },
  anamnese: { trilha: 'Clínica / Anamnese', titulo: 'Anamnese' },
} as const;

/**
 * Entrada do menu do dentista: o protótipo abre direto no paciente em atendimento; aqui o dentista
 * escolhe entre os pacientes dele no dia ou busca outro. Nenhum dado clínico é lido nesta tela.
 */
export function SelecionarPacientePage({ destino }: { destino: keyof typeof TELA }) {
  const { usuario } = useAuth();
  const local = useLocation();
  const [busca, setBusca] = useState((local.state as { busca?: string } | null)?.busca ?? '');
  const termo = useDebounce(busca.trim(), 300);
  const dia = hoje();

  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const meu = profs.data?.find((p) => p.usuario_id === usuario?.id);
  const inicio = isoLocal(dia, '00:00');
  const fim = isoLocal(somarDias(dia, 1), '00:00');
  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim],
    queryFn: () => chamar(api.GET('/consultas', { params: { query: { inicio, fim } } })),
  });
  const resultados = useQuery({
    queryKey: ['pacientes', 'seletor', termo],
    enabled: termo.length >= 2,
    // Busca no corpo (POST): um CPF nunca aparece na URL.
    queryFn: () =>
      chamar(
        api.POST('/pacientes/buscar', {
          body: { busca: termo, ativo: 'true', pagina: 1, limite: 8 },
        }),
      ),
  });

  const doDia = (consultas.data ?? []).filter(
    (c) =>
      (!meu || c.profissional.id === meu.id) && c.status !== 'cancelada' && c.status !== 'faltou',
  );
  const rota = (id: string) => `/clinica/${destino}/${id}`;

  return (
    <>
      <Cabecalho {...TELA[destino]}>
        <BuscaCabecalho
          valor={busca}
          onMudar={setBusca}
          placeholder="Buscar paciente"
          largura={300}
        />
      </Cabecalho>
      <div className="content" style={{ gap: 14 }}>
        {termo.length >= 2 && (
          <section className="card" style={{ overflow: 'hidden' }}>
            <div className="pad" style={{ paddingBottom: 10 }}>
              <h2 className="h2">Resultado da busca</h2>
            </div>
            {resultados.error ? (
              <div className="pad">
                <ErroCarga erro={resultados.error} onTentar={() => resultados.refetch()} />
              </div>
            ) : !resultados.data ? (
              <div className="pad">
                <Carregando linhas={3} />
              </div>
            ) : resultados.data.itens.length === 0 ? (
              <p className="pad muted">Nenhum paciente encontrado.</p>
            ) : (
              resultados.data.itens.map((p) => (
                <Link key={p.id} to={rota(p.id)} className="lista-movel">
                  <Avatar nome={p.nome} />
                  <div
                    style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 }}
                  >
                    <span style={{ fontWeight: 700 }}>{p.nome}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                      Prontuário <span className="num">{prontuario5(p.numero_prontuario)}</span>
                    </span>
                  </div>
                  <IconeSetaDireita tamanho={16} />
                </Link>
              ))
            )}
          </section>
        )}

        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="pad" style={{ paddingBottom: 10 }}>
            <h2 className="h2">Seus pacientes de hoje</h2>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              Escolha um paciente para abrir{' '}
              {destino === 'prontuario' ? 'o prontuário' : 'a anamnese'}, ou busque pelo nome acima.
            </span>
          </div>
          {consultas.error ? (
            <div className="pad">
              <ErroCarga erro={consultas.error} onTentar={() => consultas.refetch()} />
            </div>
          ) : !consultas.data ? (
            <div className="pad">
              <Carregando linhas={3} />
            </div>
          ) : doDia.length === 0 ? (
            <p className="pad muted">Nenhuma consulta na sua agenda de hoje.</p>
          ) : (
            doDia.map((c) => (
              <Link key={c.id} to={rota(c.paciente.id)} className="lista-movel">
                <span className="num" style={{ fontWeight: 700, width: 48 }}>
                  {fmtHora(c.inicio)}
                </span>
                <Avatar nome={c.paciente.nome} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 }}>
                  <span style={{ fontWeight: 700 }}>{c.paciente.nome}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    {c.procedimento_previsto ?? 'Consulta'}
                  </span>
                </div>
                <StatusConsulta status={c.status} />
                <IconeSetaDireita tamanho={16} />
              </Link>
            ))
          )}
        </section>
      </div>
    </>
  );
}
