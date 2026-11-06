import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { LabCliente, OrdemServico } from '../../api/types';
import { NOME_PAINEL } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga, Vazio } from '../../components/Feedback';
import { IconeEditar, IconeMais, IconePasta, IconeSetaDireita } from '../../components/Icones';
import { Seg } from '../../components/Seg';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { seloProducao, tituloTrabalho } from '../../lib/os';
import { useCelular } from '../../lib/useCelular';
import { useToast } from '../../toast/useToast';
import { NovaOsModal } from '../os/NovaOsModal';
import { OsDrawer } from '../os/OsDrawer';
import { EtapaProducaoTag, OrigemTag, Selo } from '../os/Selos';
import { ClienteForm } from './ClienteForm';

type Filtro = 'todos' | 'interno' | 'externo';

/** Nome curto da aba: a clínica própria aparece pelo primeiro nome, como na prancha. */
const nomeAba = (c: LabCliente) =>
  c.tipo === 'interno' ? c.razao_social.split(' ')[0] : c.razao_social;

export function ClientesPage() {
  const { usuario } = useAuth();
  const celular = useCelular();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [form, setForm] = useState<{ cliente?: LabCliente } | null>(null);
  const [novaOs, setNovaOs] = useState<string | null>(null);

  const caderno = params.get('caderno');
  const os = params.get('os');
  const ir = (novo: { caderno?: string | null; os?: string | null }) => {
    const p: Record<string, string> = {};
    const c = 'caderno' in novo ? novo.caderno : caderno;
    const o = 'os' in novo ? novo.os : os;
    if (c) p.caderno = c;
    if (o) p.os = o;
    setParams(p, { replace: true });
  };

  const lista = useQuery({
    queryKey: ['lab-clientes', 'lista'],
    queryFn: () => chamar(api.GET('/laboratorio/clientes')),
  });

  if (!usuario) return null;
  const clientes = lista.data ?? [];
  const podeCriarOs =
    usuario.perfil === 'adm_laboratorio' || usuario.permissoes.criar_os_externa === true;
  const t = busca.trim().toLowerCase();
  const visiveis = clientes.filter(
    (c) =>
      (filtro === 'todos' || c.tipo === filtro) &&
      (!t || [c.razao_social, c.responsavel ?? ''].some((v) => v.toLowerCase().includes(t))),
  );

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[usuario.perfil]} / Clientes`} titulo="Cadernos de clientes">
        {!celular && (
          <BuscaCabecalho
            valor={busca}
            onMudar={(v) => {
              setBusca(v);
              if (caderno) ir({ caderno: null });
            }}
            placeholder="Buscar cliente"
            largura={280}
          />
        )}
        <button
          type="button"
          className="btn pri"
          aria-label="Novo cliente"
          style={celular ? { width: 44, padding: 0 } : undefined}
          onClick={() => setForm({})}
        >
          <IconeMais />
          {!celular && 'Novo cliente'}
        </button>
      </Cabecalho>

      <div className="content" style={{ gap: 0 }}>
        <nav className="cad-abas" aria-label="Cadernos">
          <button
            type="button"
            className={`cad-aba ${!caderno ? 'on' : ''}`}
            aria-current={!caderno ? 'page' : undefined}
            onClick={() => ir({ caderno: null })}
          >
            <IconePasta tamanho={16} />
            Todos os cadernos
          </button>
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cad-aba ${caderno === c.id ? 'on' : ''}`}
              aria-current={caderno === c.id ? 'page' : undefined}
              onClick={() => ir({ caderno: c.id })}
            >
              {nomeAba(c)}
              <span className="badge b-mut">{c.os_abertas}</span>
            </button>
          ))}
        </nav>

        <div className="cad-folha">
          <div className="cad-espiral" aria-hidden="true">
            {Array.from({ length: 13 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <div className="cad-corpo">
            {lista.error ? (
              <ErroCarga erro={lista.error} onTentar={() => lista.refetch()} />
            ) : !lista.data ? (
              <Carregando />
            ) : caderno ? (
              <Caderno
                id={caderno}
                podeCriarOs={podeCriarOs}
                onEditar={(cliente) => setForm({ cliente })}
                onNovaOs={() => setNovaOs(caderno)}
                onAbrirOs={(id) => ir({ os: id })}
              />
            ) : (
              <>
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <h2 className="h2" style={{ fontSize: 20 }}>
                    Todos os cadernos
                  </h2>
                  <Seg
                    pequeno
                    rotulo="Origem"
                    valor={filtro}
                    onMudar={setFiltro}
                    opcoes={[
                      { valor: 'todos', rotulo: 'Todos' },
                      { valor: 'interno', rotulo: 'Própria' },
                      { valor: 'externo', rotulo: 'Externos' },
                    ]}
                  />
                  {!celular && (
                    <span className="cad-meta" style={{ marginLeft: 'auto' }}>
                      Cada cliente tem o próprio caderno de ordens de serviço.
                    </span>
                  )}
                </div>

                {celular ? (
                  <div className="os-movel">
                    {visiveis.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="card os-movel-card"
                        onClick={() => ir({ caderno: c.id })}
                      >
                        <span className="l1">
                          <b>{c.razao_social}</b>
                          <OrigemTag tipo={c.tipo} />
                        </span>
                        <span className="l2">
                          {c.os_abertas} OS em aberto
                          {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div className="cli-grade os-grade cab">
                      <span className="th">Cliente</span>
                      <span className="th">Origem</span>
                      <span className="th">CNPJ / CPF</span>
                      <span className="th">Telefone</span>
                      <span className="th" style={{ justifySelf: 'end' }}>
                        OS
                      </span>
                      <span className="th">Pagamento</span>
                      <span className="th" style={{ justifySelf: 'end' }}>
                        Caderno
                      </span>
                    </div>
                    {visiveis.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="cli-grade os-linha"
                        style={{ minHeight: 58 }}
                        onClick={() => ir({ caderno: c.id })}
                      >
                        <span className="os-trab">
                          <b>{c.razao_social}</b>
                          <small>{[c.responsavel, c.cro].filter(Boolean).join(' · ') || '—'}</small>
                        </span>
                        <span>
                          <OrigemTag tipo={c.tipo} />
                        </span>
                        <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                          {c.documento ?? '—'}
                        </span>
                        <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                          {c.telefone ?? '—'}
                        </span>
                        <span className="num" style={{ justifySelf: 'end', fontWeight: 700 }}>
                          {c.os_abertas}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                          {c.condicao_pagamento ?? '—'}
                        </span>
                        <span
                          className="link-acao"
                          style={{ justifySelf: 'end', color: 'var(--primary)' }}
                        >
                          Abrir caderno
                        </span>
                      </button>
                    ))}
                    {!visiveis.length && <Vazio titulo="Nenhum cliente encontrado" />}
                  </div>
                )}

                <div className="cad-ind" style={{ borderBottom: 0 }}>
                  <div>
                    <small>Clientes ativos</small>
                    <b>{clientes.length}</b>
                  </div>
                  <div>
                    <small>OS em aberto</small>
                    <b>{clientes.reduce((n, c) => n + c.os_abertas, 0)}</b>
                  </div>
                  <div>
                    <small>Clientes externos</small>
                    <b>{clientes.filter((c) => c.tipo === 'externo').length}</b>
                  </div>
                  <span className="nota">
                    Clientes externos não acessam o sistema: as OS deles são cadastradas aqui pelo
                    laboratório.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {os && <OsDrawer id={os} onFechar={() => ir({ os: null })} />}
      {form && (
        <ClienteForm
          cliente={form.cliente}
          onFechar={() => setForm(null)}
          aoSalvar={(id) => ir({ caderno: id })}
        />
      )}
      {novaOs && (
        <NovaOsModal
          origem="externa"
          clienteId={novaOs}
          clientes={clientes}
          onFechar={() => setNovaOs(null)}
          aoCriar={(id) => ir({ os: id })}
        />
      )}
    </>
  );
}

function Caderno({
  id,
  podeCriarOs,
  onEditar,
  onNovaOs,
  onAbrirOs,
}: {
  id: string;
  podeCriarOs: boolean;
  onEditar: (c: LabCliente) => void;
  onNovaOs: () => void;
  onAbrirOs: (id: string) => void;
}) {
  const { avisar } = useToast();
  const [revelado, setRevelado] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ['lab-clientes', 'caderno', id],
    queryFn: () => chamar(api.GET('/laboratorio/clientes/{id}', { params: { path: { id } } })),
  });
  // O valor completo só existe na memória desta tela; a consulta fica na auditoria.
  const revelar = useMutation({
    mutationFn: (campo: 'documento' | 'telefone') =>
      chamar(
        api.GET('/laboratorio/clientes/{id}/revelar/{campo}', { params: { path: { id, campo } } }),
      ),
    onSuccess: (r) => setRevelado((a) => ({ ...a, [r.campo]: r.valor ?? '—' })),
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  if (q.error) return <ErroCarga erro={q.error} onTentar={() => q.refetch()} />;
  if (!q.data) return <Carregando />;
  const { cliente: c, indicadores: ind, em_producao, entregues } = q.data;
  const interno = c.tipo === 'interno';
  const local = [c.endereco?.cidade, c.endereco?.uf].filter(Boolean).join(' · ');

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 5, minWidth: 0, flex: '1 1 320px' }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <h2 className="h2" style={{ fontSize: 22 }}>
              {c.razao_social}
            </h2>
            {interno ? (
              <span className="badge b-own">Clínica própria</span>
            ) : (
              <span className="badge b-lab">Cliente externo</span>
            )}
            {!c.ativo && <span className="badge b-mut">Inativo</span>}
          </div>
          <span className="cad-meta">
            {c.documento && (
              <>
                {c.documento_tipo === 'cpf' ? 'CPF' : 'CNPJ'} {revelado.documento ?? c.documento}
                {!revelado.documento && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="link-acao cad-revelar"
                      aria-label="Revelar documento (fica registrado na auditoria)"
                      onClick={() => revelar.mutate('documento')}
                    >
                      Revelar
                    </button>
                  </>
                )}
                {' · '}
              </>
            )}
            {[c.responsavel, c.cro].filter(Boolean).join(' · ')}
            {c.telefone && (
              <>
                {' · '}
                {revelado.telefone ?? c.telefone}
                {!revelado.telefone && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="link-acao cad-revelar"
                      aria-label="Revelar telefone (fica registrado na auditoria)"
                      onClick={() => revelar.mutate('telefone')}
                    >
                      Revelar
                    </button>
                  </>
                )}
              </>
            )}
            {local && ` · ${local}`}
            {c.condicao_pagamento && ` · ${c.condicao_pagamento}`}
          </span>
        </div>
        <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
          <Button variante="secondary" onClick={() => onEditar(c)}>
            <IconeEditar />
            Editar cliente
          </Button>
          {!interno && podeCriarOs && c.ativo && (
            <Button onClick={onNovaOs}>
              <IconeMais />
              Nova OS neste caderno
            </Button>
          )}
        </div>
      </div>

      <div className="cad-ind">
        <div>
          <small>OS abertas</small>
          <b>{ind.os_abertas}</b>
        </div>
        <div>
          <small>Entregues no mês</small>
          <b>{ind.entregues_mes}</b>
        </div>
        <div>
          <small>No prazo</small>
          <b>{ind.no_prazo_pct == null ? '—' : `${ind.no_prazo_pct}%`}</b>
        </div>
        <div>
          <small>Refações no mês</small>
          <b style={{ color: ind.refacoes_mes ? '#B54708' : undefined }}>{ind.refacoes_mes}</b>
        </div>
        <span className="nota">
          {interno
            ? 'Cliente interno: as OS chegam integradas da clínica e caem direto neste caderno.'
            : 'Cada OS registrada para este cliente é arquivada aqui automaticamente.'}
        </span>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="eyebrow">Em produção</span>
          <span className="cad-meta">ordem de chegada</span>
        </div>
        {em_producao.map((o) => (
          <LinhaCaderno key={o.id} os={o} onAbrir={onAbrirOs} />
        ))}
        {!em_producao.length && <span className="cad-meta">Nenhuma OS em produção.</span>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">Entregues</span>
        {entregues.map((o) => (
          <LinhaCaderno key={o.id} os={o} onAbrir={onAbrirOs} entregue />
        ))}
        {!entregues.length && <span className="cad-meta">Nenhuma OS entregue ainda.</span>}
      </div>
    </>
  );
}

function LinhaCaderno({
  os,
  onAbrir,
  entregue,
}: {
  os: OrdemServico;
  onAbrir: (id: string) => void;
  entregue?: boolean;
}) {
  return (
    <button type="button" className="cad-linha" onClick={() => onAbrir(os.id)}>
      <span className="os-num">{os.numero}</span>
      <span className="os-trab">
        <b>{tituloTrabalho(os)}</b>
        <small>Paciente: {os.paciente.nome}</small>
      </span>
      <span className="so-desktop">
        {entregue ? null : <EtapaProducaoTag etapa={os.etapa_producao} />}
      </span>
      <span>
        <Selo selo={seloProducao(os)} />
      </span>
      <span className="so-desktop" style={{ justifySelf: 'end' }}>
        {os.tecnico ? (
          <Avatar nome={os.tecnico.nome} tamanho={28} tom="i" />
        ) : (
          <IconeSetaDireita tamanho={16} />
        )}
      </span>
    </button>
  );
}
