import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import type { EtapaOs, OrdemServico } from '../../api/types';
import { NOME_PAINEL } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Chip } from '../../components/Chip';
import { ErroCarga, Vazio } from '../../components/Feedback';
import { Seg } from '../../components/Seg';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { mapaDeAcentos, type Acento } from '../../lib/acentos';
import {
  casaBusca,
  COLUNAS_QUADRO,
  ETAPA_CURTA,
  NOME_LABORATORIO,
  ordemPrazo,
  seloClinica,
  tituloTrabalho,
} from '../../lib/os';
import { useCelular } from '../../lib/useCelular';
import { OsDrawer } from './OsDrawer';
import { Selo } from './Selos';
import { useConcluidasDaSemana, useOrdens } from './useOs';

/**
 * Quadro de OS da Secretaria — somente leitura: mostra em que etapa cada OS está.
 * Quem gera a OS é o dentista (no prontuário) e quem a move é o laboratório.
 */
export function OrdensPage() {
  const { usuario } = useAuth();
  const celular = useCelular();
  const [params, setParams] = useSearchParams();
  const [visao, setVisao] = useState<'aberta' | 'cancelada'>('aberta');
  const [busca, setBusca] = useState('');
  const [dentista, setDentista] = useState('');
  const [etapaMovel, setEtapaMovel] = useState<EtapaOs | ''>('');

  // A OS aberta fica na URL (só o id): é para lá que as notificações apontam.
  const aberta = params.get('os');
  const abrir = (id: string | null) => setParams(id ? { os: id } : {}, { replace: true });

  const lista = useOrdens(visao);
  const concluidas = useConcluidasDaSemana();
  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const acentos = useMemo(() => mapaDeAcentos(profs.data ?? []), [profs.data]);

  const filtrar = (o: OrdemServico) =>
    casaBusca(o, busca) && (!dentista || o.dentista?.id === dentista);
  const abertas = (lista.data ?? []).filter(filtrar);
  const daSemana = (concluidas.data ?? []).filter(filtrar);

  if (!usuario) return null;
  const titulo = 'Ordens de serviço';

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[usuario.perfil]} / ${titulo}`} titulo={titulo}>
        {!celular && (
          <BuscaCabecalho
            valor={busca}
            onMudar={setBusca}
            placeholder="OS ou paciente"
            largura={300}
          />
        )}
      </Cabecalho>

      <div className="content">
        <div className="os-filtros">
          <Seg
            rotulo="Situação"
            valor={visao}
            onMudar={setVisao}
            opcoes={[
              { valor: 'aberta', rotulo: 'Em andamento' },
              { valor: 'cancelada', rotulo: 'Canceladas' },
            ]}
          />
          {!celular && (
            <>
              <select
                className="sel-chip"
                aria-label="Dentista"
                value={dentista}
                onChange={(e) => setDentista(e.target.value)}
              >
                <option value="">Dentista: todos</option>
                {profs.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <span className="dica">
                Acompanhamento: o dentista gera a OS no prontuário e o laboratório atualiza as
                etapas
              </span>
            </>
          )}
        </div>

        {lista.error && <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />}

        {visao === 'cancelada' ? (
          <div className="os-movel" style={{ maxWidth: 720 }}>
            {lista.data && !abertas.length && (
              <div className="card">
                <Vazio titulo="Nenhuma OS cancelada" />
              </div>
            )}
            {abertas.map((o) => (
              <CartaoMovel key={o.id} os={o} onAbrir={abrir} />
            ))}
          </div>
        ) : celular ? (
          <>
            <div className="chips-rolagem">
              <Chip ativo={!etapaMovel} onClick={() => setEtapaMovel('')}>
                Todas · {abertas.length}
              </Chip>
              {COLUNAS_QUADRO.filter((e) => e.id !== 'concluida').map((e) => (
                <Chip key={e.id} ativo={etapaMovel === e.id} onClick={() => setEtapaMovel(e.id)}>
                  {ETAPA_CURTA[e.id]} · {abertas.filter((o) => o.etapa === e.id).length}
                </Chip>
              ))}
            </div>
            <div className="os-movel">
              {[...abertas]
                .filter((o) => !etapaMovel || o.etapa === etapaMovel)
                .sort((a, b) => ordemPrazo(a) - ordemPrazo(b))
                .map((o) => (
                  <CartaoMovel key={o.id} os={o} onAbrir={abrir} />
                ))}
              {lista.data && !abertas.length && (
                <div className="card">
                  <Vazio titulo="Nenhuma OS em andamento" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="os-quadro quatro" aria-busy={lista.isFetching}>
            {COLUNAS_QUADRO.map((col) => {
              const itens =
                col.id === 'concluida' ? daSemana : abertas.filter((o) => o.etapa === col.id);
              return (
                <section key={col.id} className={`os-col ${col.id}`} aria-label={col.titulo}>
                  <div className="os-col-cab">
                    <i style={{ background: col.ponto }} />
                    {col.titulo}
                    <span className="n">{itens.length}</span>
                  </div>
                  {itens.map((o) => (
                    <Cartao
                      key={o.id}
                      os={o}
                      acento={o.dentista?.id ? acentos[o.dentista.id] : undefined}
                      onAbrir={abrir}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {aberta && <OsDrawer id={aberta} onFechar={() => abrir(null)} />}
    </>
  );
}

function Cartao({
  os,
  acento,
  onAbrir,
}: {
  os: OrdemServico;
  acento?: Acento;
  onAbrir: (id: string) => void;
}) {
  const titulo = tituloTrabalho(os);
  return (
    <article className="os-card">
      <div className="topo">
        <span className="os-num">{os.numero}</span>
        <Selo selo={seloClinica(os)} />
      </div>
      <button
        type="button"
        className="os-titulo"
        onClick={() => onAbrir(os.id)}
        aria-label={`Detalhes da ${os.numero}: ${titulo}`}
      >
        {titulo}
      </button>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{os.paciente.nome}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {os.dentista && (
          <span
            className="os-dentista"
            style={{
              background: acento?.fundo ?? 'var(--primary-soft)',
              color: acento?.texto ?? 'var(--primary-ink)',
            }}
          >
            {os.dentista.nome}
          </span>
        )}
        {(os.etapa === 'envio' || os.etapa === 'laboratorio') && os.laboratorio && (
          <span className="badge b-lab">{NOME_LABORATORIO[os.laboratorio]}</span>
        )}
      </div>
    </article>
  );
}

function CartaoMovel({ os, onAbrir }: { os: OrdemServico; onAbrir: (id: string) => void }) {
  return (
    <button type="button" className="card os-movel-card" onClick={() => onAbrir(os.id)}>
      <span className="l1">
        <b>{tituloTrabalho(os)}</b>
        <Selo selo={seloClinica(os)} pequeno />
      </span>
      <span className="l2">
        <span className="num" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>
          {os.numero}
        </span>{' '}
        · {os.paciente.nome}
        {os.etapa && os.status === 'aberta' ? ` · ${ETAPA_CURTA[os.etapa]}` : ''}
      </span>
    </button>
  );
}
