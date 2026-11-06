import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import type { EtapaProducao, OrdemServico } from '../../api/types';
import { NOME_PAINEL } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/Avatar';
import { Chip } from '../../components/Chip';
import { ErroCarga, Vazio } from '../../components/Feedback';
import {
  IconeAlerta,
  IconeMais,
  IconePasta,
  IconePrancheta,
  IconeSetaDireita,
} from '../../components/Icones';
import { Seg } from '../../components/Seg';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import {
  casaBusca,
  ETAPAS_PRODUCAO,
  ordemPrazo,
  PRODUCAO,
  seloProducao,
  tituloTrabalho,
} from '../../lib/os';
import { useCelular } from '../../lib/useCelular';
import { NovaOsModal } from '../os/NovaOsModal';
import { OsDrawer } from '../os/OsDrawer';
import { EtapaProducaoTag, Selo } from '../os/Selos';
import { useOrdens } from '../os/useOs';

type Origem = 'todas' | 'propria' | 'externa';

export function ProducaoPage() {
  const { usuario } = useAuth();
  const celular = useCelular();
  const [params, setParams] = useSearchParams();
  const [origem, setOrigem] = useState<Origem>('todas');
  const [etapa, setEtapa] = useState<EtapaProducao | ''>('');
  const [tecnico, setTecnico] = useState('');
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);

  const aberta = params.get('os');
  const abrir = (id: string | null) => setParams(id ? { os: id } : {}, { replace: true });

  const lista = useOrdens('aberta');
  const clientes = useQuery({
    queryKey: ['lab-clientes', 'lista'],
    queryFn: () => chamar(api.GET('/laboratorio/clientes')),
  });
  const tecnicos = useQuery({
    queryKey: ['os', 'tecnicos'],
    queryFn: () => chamar(api.GET('/ordens-servico/tecnicos')),
    staleTime: 60_000,
  });

  if (!usuario) return null;
  const podeCriar =
    usuario.perfil === 'adm_laboratorio' || usuario.permissoes.criar_os_externa === true;

  const todas = lista.data ?? [];
  const visiveis = todas.filter(
    (o) =>
      casaBusca(o, busca) &&
      (origem === 'todas' || o.origem === origem) &&
      (!etapa || o.etapa_producao === etapa) &&
      (!tecnico || o.tecnico?.id === tecnico),
  );
  const atrasadas = todas.filter((o) => o.prazo.situacao === 'atrasada').length;
  const aVencer = todas.filter((o) => o.prazo.situacao === 'a_vencer').length;
  const grupos = [
    { id: 'propria', titulo: 'Chegaram da clínica própria' },
    { id: 'externa', titulo: 'Criadas no laboratório · clientes externos' },
  ] as const;
  const titulo = celular ? 'Produção' : 'Ordens de serviço';

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[usuario.perfil]} / Ordens de serviço`} titulo={titulo}>
        {!celular && (
          <BuscaCabecalho
            valor={busca}
            onMudar={setBusca}
            placeholder="OS, paciente ou cliente"
            largura={300}
          />
        )}
        {podeCriar && (
          <button
            type="button"
            className="btn pri"
            aria-label="Nova OS"
            style={celular ? { width: 44, padding: 0 } : undefined}
            onClick={() => setNova(true)}
          >
            <IconeMais />
            {!celular && 'Nova OS'}
          </button>
        )}
      </Cabecalho>

      <div className="content" style={{ gap: celular ? 10 : 14 }}>
        {celular ? (
          <>
            <div className="os-tres">
              <div className="card">
                <b className="num" style={{ color: '#43339A' }}>
                  {todas.length}
                </b>
                <small>em produção</small>
              </div>
              <div className="card">
                <b className="num" style={{ color: '#B42318' }}>
                  {atrasadas}
                </b>
                <small>{atrasadas === 1 ? 'atrasada' : 'atrasadas'}</small>
              </div>
              <div className="card">
                <b className="num" style={{ color: '#B54708' }}>
                  {aVencer}
                </b>
                <small>a vencer</small>
              </div>
            </div>
            <div className="chips-rolagem">
              <Chip ativo={origem === 'todas'} onClick={() => setOrigem('todas')}>
                Todas
              </Chip>
              <Chip ativo={origem === 'propria'} onClick={() => setOrigem('propria')}>
                Própria
              </Chip>
              <Chip ativo={origem === 'externa'} onClick={() => setOrigem('externa')}>
                Externas
              </Chip>
            </div>
          </>
        ) : (
          <>
            <div className="os-filtros">
              <span className="eyebrow">Origem</span>
              <Seg
                pequeno
                rotulo="Origem"
                valor={origem}
                onMudar={setOrigem}
                opcoes={[
                  { valor: 'todas', rotulo: 'Todas' },
                  { valor: 'propria', rotulo: 'Clínica própria' },
                  { valor: 'externa', rotulo: 'Externas' },
                ]}
              />
              <select
                className="sel-chip"
                aria-label="Etapa"
                value={etapa}
                onChange={(e) => setEtapa(e.target.value as EtapaProducao | '')}
              >
                <option value="">Todas as etapas</option>
                {ETAPAS_PRODUCAO.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
              <select
                className="sel-chip"
                aria-label="Técnico"
                value={tecnico}
                onChange={(e) => setTecnico(e.target.value)}
              >
                <option value="">Todos os técnicos</option>
                {tecnicos.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {atrasadas > 0 && (
                  <span className="badge b-bad">
                    <IconeAlerta tamanho={13} />
                    {atrasadas} {atrasadas === 1 ? 'atrasada' : 'atrasadas'}
                  </span>
                )}
                {aVencer > 0 && (
                  <span className="badge b-warn">
                    {aVencer} {aVencer === 1 ? 'vence' : 'vencem'} em 3 dias
                  </span>
                )}
                <span className="badge b-mut">
                  {todas.length} {todas.length === 1 ? 'ordem' : 'ordens'}
                </span>
              </div>
            </div>
            <div className="card os-aviso">
              <IconePrancheta tamanho={20} />
              <span>
                <b>Clique em uma ordem de serviço</b> para ver o detalhe e mudar a etapa. Toda OS
                registrada é arquivada no caderno do cliente.
              </span>
            </div>
          </>
        )}

        {lista.error && <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />}

        {celular ? (
          <div className="os-movel">
            {[...visiveis]
              .sort((a, b) => ordemPrazo(a) - ordemPrazo(b))
              .map((o) => (
                <CartaoMovel key={o.id} os={o} onAbrir={abrir} />
              ))}
            {lista.data && !visiveis.length && (
              <div className="card">
                <Vazio titulo="Nenhuma OS em produção" />
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }} aria-busy={lista.isFetching}>
            <div className="os-grade cab">
              <span className="th">OS</span>
              <span className="th">Trabalho</span>
              <span className="th">Caderno do cliente</span>
              <span className="th">Etapa</span>
              <span className="th">Prazo</span>
              <span className="th" style={{ justifySelf: 'center' }}>
                Técnico
              </span>
              <span />
            </div>
            {grupos.map((g) => {
              const itens = visiveis.filter((o) => o.origem === g.id);
              if (origem !== 'todas' && origem !== g.id) return null;
              return (
                <div key={g.id}>
                  <div className="os-grupo">
                    <span className="eyebrow">{g.titulo}</span>
                    <span className="badge b-mut selo-sm" style={{ height: 20 }}>
                      {itens.length}
                    </span>
                  </div>
                  {itens.map((o) => (
                    <Linha key={o.id} os={o} onAbrir={abrir} />
                  ))}
                  {lista.data && !itens.length && (
                    <p className="muted" style={{ padding: '12px 16px' }}>
                      Nenhuma ordem neste grupo.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {aberta && <OsDrawer id={aberta} onFechar={() => abrir(null)} />}
      {nova && (
        <NovaOsModal
          origem="externa"
          clientes={clientes.data}
          onFechar={() => setNova(false)}
          aoCriar={abrir}
        />
      )}
    </>
  );
}

function Linha({ os, onAbrir }: { os: OrdemServico; onAbrir: (id: string) => void }) {
  return (
    <button type="button" className="os-grade os-linha" onClick={() => onAbrir(os.id)}>
      <span className="os-num">{os.numero}</span>
      <span className="os-trab">
        <b>{tituloTrabalho(os)}</b>
        <small>Paciente: {os.paciente.nome}</small>
      </span>
      <span className="cliente">
        <IconePasta tamanho={16} />
        <span>{os.cliente.nome}</span>
      </span>
      <EtapaProducaoTag etapa={os.etapa_producao} />
      <span>
        <Selo selo={seloProducao(os)} />
      </span>
      <span style={{ justifySelf: 'center' }}>
        {os.tecnico ? (
          <Avatar nome={os.tecnico.nome} tamanho={28} tom="i" />
        ) : (
          <span style={{ fontSize: 12, color: '#8A9490' }}>—</span>
        )}
      </span>
      <span style={{ color: '#8A9490', justifySelf: 'end' }}>
        <IconeSetaDireita tamanho={16} />
      </span>
    </button>
  );
}

function CartaoMovel({ os, onAbrir }: { os: OrdemServico; onAbrir: (id: string) => void }) {
  const selo = seloProducao(os);
  return (
    <button
      type="button"
      className="card os-movel-card"
      style={{ gap: 5 }}
      onClick={() => onAbrir(os.id)}
    >
      <span className="l1">
        <span className="l2" style={{ flexGrow: 1 }}>
          <span className="num" style={{ fontWeight: 700, color: 'var(--ink)' }}>
            {os.numero}
          </span>{' '}
          · {os.etapa_producao ? PRODUCAO[os.etapa_producao].titulo : '—'}
        </span>
        <Selo selo={selo} pequeno />
      </span>
      <b style={{ fontSize: 15 }}>{tituloTrabalho(os)}</b>
      <span className="l1">
        <span className="l2" style={{ flexGrow: 1, minWidth: 0 }}>
          {os.cliente.nome}
        </span>
        <span
          className={`badge ${os.origem === 'propria' ? 'b-own' : 'b-lab'} selo-sm`}
          style={{ height: 20 }}
        >
          {os.origem === 'propria' ? 'Própria' : 'Externa'}
        </span>
        {os.tecnico && <Avatar nome={os.tecnico.nome} tamanho={26} tom="i" />}
      </span>
    </button>
  );
}
