import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { EtapaProducao, OsAnexo } from '../../api/types';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { IconeCheck, IconeClipe, IconeSetaDireita } from '../../components/Icones';
import { Overlay } from '../../components/Overlay';
import { fmtDataBR, fmtDataHora, hoje } from '../../lib/datas';
import {
  ETAPAS_PRODUCAO,
  NOME_ETAPA,
  NOME_LABORATORIO,
  nomeDeEtapa,
  seloClinica,
  seloProducao,
  tituloTrabalho,
} from '../../lib/os';
import { useToast } from '../../toast/useToast';
import { MotivoDialog } from './MotivoDialog';
import { EtapaProducaoTag, OrigemTag, Selo } from './Selos';
import { SEM_CACHE, useInvalidarOs, useMoverOs, useOs } from './useOs';

const TIPOS_ANEXO = {
  foto: 'Foto',
  escaneamento: 'Escaneamento',
  documento: 'Documento',
  radiografia: 'Radiografia',
  outro: 'Outro',
} as const;
const ACEITOS = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX = 50 * 1024 * 1024;

type Dialogo = 'cancelar' | 'refacao' | 'prova_ajuste' | null;

interface Props {
  id: string;
  onFechar: () => void;
}

/** Detalhe da OS. Para a Secretaria e o dentista é só leitura; as ações são do laboratório. */
export function OsDrawer({ id, onFechar }: Props) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const invalidar = useInvalidarOs();
  const os = useOs(id);
  const mover = useMoverOs();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [previsao, setPrevisao] = useState('');

  const lab = usuario?.unidade === 'laboratorio';
  const secretaria = usuario?.perfil === 'secretaria';
  const podeHistorico = lab || secretaria;
  const podeCancelar =
    usuario?.perfil === 'adm_laboratorio' ||
    (usuario?.perfil === 'laboratorio' && usuario.permissoes.cancelar_os === true);

  const historico = useQuery({
    queryKey: ['os', 'detalhe', id, 'historico'],
    enabled: podeHistorico,
    queryFn: () => chamar(api.GET('/ordens-servico/{id}/historico', { params: { path: { id } } })),
    ...SEM_CACHE,
  });
  const tecnicos = useQuery({
    queryKey: ['os', 'tecnicos'],
    enabled: lab,
    queryFn: () => chamar(api.GET('/ordens-servico/tecnicos')),
    staleTime: 60_000,
  });

  const aoErrar = (e: unknown) => avisar(mensagemDeErro(e), 'erro');
  const caminho = { params: { path: { id } } };

  const tecnico = useMutation({
    mutationFn: (tecnico_id: string | null) =>
      chamar(api.POST('/ordens-servico/{id}/tecnico', { ...caminho, body: { tecnico_id } })),
    onSuccess: invalidar,
    onError: aoErrar,
  });
  const prazo = useMutation({
    mutationFn: (previsao_entrega: string) =>
      chamar(
        api.PATCH('/ordens-servico/{id}', {
          ...caminho,
          body: { previsao_entrega } as never,
        }),
      ),
    onSuccess: () => {
      invalidar();
      setPrevisao('');
      avisar('Previsão de entrega atualizada.', 'ok');
    },
    onError: aoErrar,
  });
  const prova = useMutation({
    mutationFn: (body: { resultado: 'aprovada' | 'ajuste'; motivo?: string }) =>
      chamar(api.POST('/ordens-servico/{id}/provas', { ...caminho, body })),
    onSuccess: () => {
      invalidar();
      setDialogo(null);
      avisar('Devolução da prova registrada.', 'ok');
    },
    onError: aoErrar,
  });
  const refacao = useMutation({
    mutationFn: (motivo: string) =>
      chamar(api.POST('/ordens-servico/{id}/refacoes', { ...caminho, body: { motivo } })),
    onSuccess: () => {
      invalidar();
      setDialogo(null);
      avisar('Refação registrada: a OS voltou para "Modelo".', 'ok');
    },
    onError: aoErrar,
  });
  const cancelar = useMutation({
    mutationFn: (motivo: string) =>
      chamar(api.POST('/ordens-servico/{id}/cancelar', { ...caminho, body: { motivo } })),
    onSuccess: () => {
      invalidar();
      setDialogo(null);
      avisar('Ordem de serviço cancelada.', 'ok');
    },
    onError: aoErrar,
  });

  const d = os.data;
  const aberta = d?.status === 'aberta';

  return (
    <>
      <Overlay
        tipo="drawer"
        titulo={d ? `${d.numero} · ${tituloTrabalho(d)}` : 'Ordem de serviço'}
        descricao={d ? `Paciente: ${d.paciente.nome}` : undefined}
        onFechar={onFechar}
      >
        {os.error ? (
          <ErroCarga erro={os.error} onTentar={() => os.refetch()} />
        ) : !d ? (
          <Carregando />
        ) : (
          <div className="stack" style={{ gap: 0 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 14 }}>
              <Selo selo={lab ? seloProducao(d) : seloClinica(d)} />
              {lab ? (
                <>
                  <OrigemTag tipo={d.cliente.tipo} />
                  <EtapaProducaoTag etapa={d.etapa_producao} />
                </>
              ) : (
                d.etapa && <span className="badge b-mut">{NOME_ETAPA[d.etapa]}</span>
              )}
              {!lab && d.refacoes > 0 && <span className="badge b-warn">Refação {d.refacoes}</span>}
            </div>
            {d.status === 'cancelada' && (
              <div className="alert" style={{ marginBottom: 14 }}>
                Cancelada{d.cancelada_em ? ` em ${fmtDataHora(d.cancelada_em)}` : ''}. Motivo:{' '}
                {d.motivo_cancelamento}
              </div>
            )}

            <Bloco titulo="Dados do trabalho">
              <dl className="dl">
                {lab && <Dado rotulo="Caderno do cliente">{d.cliente.nome}</Dado>}
                <Dado rotulo="Dentista">{d.dentista?.nome ?? '—'}</Dado>
                <Dado rotulo="Elementos">{d.elementos.length ? d.elementos.join(', ') : '—'}</Dado>
                <Dado rotulo="Cor">{d.cor ?? '—'}</Dado>
                <Dado rotulo="Material">{d.material ?? '—'}</Dado>
                {!lab && (
                  <Dado rotulo="Laboratório">
                    {d.laboratorio ? NOME_LABORATORIO[d.laboratorio] : 'A definir no envio'}
                  </Dado>
                )}
                <Dado rotulo="Previsão de entrega">
                  {d.previsao_entrega ? fmtDataBR(d.previsao_entrega) : 'Sem prazo'}
                </Dado>
                {!lab && (
                  <Dado rotulo="Etapa no laboratório">
                    <EtapaProducaoTag etapa={d.etapa_producao} />
                  </Dado>
                )}
                {'valor' in d && (
                  <Dado rotulo="Valor">
                    {d.valor == null
                      ? 'Sem preço na tabela'
                      : d.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Dado>
                )}
              </dl>
              {d.observacoes && (
                <p style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  <span className="eyebrow">Observações</span>
                  <br />
                  {d.observacoes}
                </p>
              )}
            </Bloco>

            {aberta && lab && (
              <>
                <Bloco titulo="Etapa de produção">
                  {d.prova_aberta ? (
                    <div className="stack" style={{ gap: 8 }}>
                      <span className="muted">
                        A prova está na clínica. Registre a devolução para seguir a produção.
                      </span>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          pequeno
                          carregando={prova.isPending}
                          onClick={() => prova.mutate({ resultado: 'aprovada' })}
                        >
                          <IconeCheck tamanho={14} />
                          Prova aprovada
                        </Button>
                        <Button
                          pequeno
                          variante="secondary"
                          onClick={() => setDialogo('prova_ajuste')}
                        >
                          Voltou com ajuste
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="os-trilho" role="group" aria-label="Etapa de produção">
                      {ETAPAS_PRODUCAO.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className={`chip ${d.etapa_producao === e.id ? 'on' : ''}`}
                          aria-pressed={d.etapa_producao === e.id}
                          disabled={mover.isPending || d.etapa_producao === e.id}
                          onClick={() => mover.mutate({ id, etapa: e.id as EtapaProducao })}
                        >
                          {e.titulo}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {!d.prova_aberta &&
                      (d.etapa_producao === 'pronta' || d.etapa_producao === 'enviada') && (
                        <Button
                          pequeno
                          variante="mint"
                          carregando={mover.isPending}
                          onClick={() => mover.mutate({ id, etapa: 'entregue' })}
                        >
                          <IconeCheck tamanho={14} />
                          Concluir OS
                        </Button>
                      )}
                    <Button pequeno variante="secondary" onClick={() => setDialogo('refacao')}>
                      Registrar refação
                    </Button>
                  </div>
                  {d.origem === 'propria' && d.etapa_producao === 'enviada' && (
                    <span className="muted">
                      Enviada à clínica. Se a peça voltar, registre a refação; quando não houver
                      mais ajuste, conclua a OS.
                    </span>
                  )}
                </Bloco>

                <Bloco titulo="Técnico responsável">
                  <div className="row" style={{ gap: 10 }}>
                    {d.tecnico && <Avatar nome={d.tecnico.nome} tamanho={32} tom="i" />}
                    <select
                      className="select"
                      style={{ flex: '1 1 0', minWidth: 0 }}
                      aria-label="Técnico responsável"
                      value={d.tecnico?.id ?? ''}
                      disabled={tecnico.isPending}
                      onChange={(e) => tecnico.mutate(e.target.value || null)}
                    >
                      <option value="">Sem técnico</option>
                      {tecnicos.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </Bloco>
              </>
            )}

            {aberta && lab && (
              <Bloco titulo="Previsão de entrega">
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    type="date"
                    aria-label="Nova previsão de entrega"
                    min={hoje()}
                    value={previsao || d.previsao_entrega || ''}
                    onChange={(e) => setPrevisao(e.target.value)}
                  />
                  <Button
                    pequeno
                    variante="secondary"
                    disabled={!previsao || previsao === d.previsao_entrega}
                    carregando={prazo.isPending}
                    onClick={() => prazo.mutate(previsao)}
                  >
                    Salvar prazo
                  </Button>
                </div>
              </Bloco>
            )}

            {(d.historico_provas.length > 0 || d.historico_refacoes.length > 0) && (
              <Bloco titulo="Provas e refações">
                <ul className="os-hist">
                  {d.historico_provas.map((p) => (
                    <li key={p.id}>
                      <i style={{ background: '#DE6B2F' }} />
                      <span>
                        <b>Prova {p.numero}</b> · enviada em {fmtDataHora(p.enviada_em)}
                        {p.devolvida_em
                          ? ` · devolvida em ${fmtDataHora(p.devolvida_em)} (${p.resultado === 'aprovada' ? 'aprovada' : 'com ajuste'})`
                          : ' · na clínica'}
                        {p.motivo ? ` — ${p.motivo}` : ''}
                      </span>
                    </li>
                  ))}
                  {d.historico_refacoes.map((r) => (
                    <li key={r.id}>
                      <i style={{ background: '#B54708' }} />
                      <span>
                        <b>Refação {r.numero}</b> · {fmtDataHora(r.data)} — {r.motivo}
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloco>
            )}

            {podeHistorico && <Anexos osId={id} podeEnviar={lab && d.status !== 'cancelada'} />}

            {podeHistorico && (
              <Bloco titulo="Histórico de etapas">
                {!historico.data ? (
                  <Carregando linhas={3} />
                ) : (
                  <ul className="os-hist">
                    {historico.data.map((h, i) => (
                      <li key={i} className={h.lado}>
                        <i />
                        <span>
                          <b>
                            {h.de_etapa ? `${nomeDeEtapa(h.de_etapa)} → ` : ''}
                            {nomeDeEtapa(h.para_etapa)}
                          </b>
                          <span className="muted">
                            {' '}
                            ·{' '}
                            {h.lado === 'laboratorio'
                              ? 'laboratório'
                              : h.lado === 'clinica'
                                ? 'clínica'
                                : 'situação'}
                          </span>
                          <br />
                          <span className="muted">
                            {fmtDataHora(h.em)} · {h.usuario_nome ?? 'usuário removido'}
                            {h.observacao ? ` — ${h.observacao}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloco>
            )}

            <div className="os-det-bloco row" style={{ justifyContent: 'space-between' }}>
              {lab ? (
                <Link className="link-acao" to={`/lab/clientes?caderno=${d.cliente.id}`}>
                  Abrir caderno do cliente <IconeSetaDireita tamanho={14} />
                </Link>
              ) : d.paciente.id ? (
                <Link className="link-acao" to={`/pacientes/${d.paciente.id}`}>
                  Abrir ficha do paciente <IconeSetaDireita tamanho={14} />
                </Link>
              ) : (
                <span />
              )}
              {aberta && podeCancelar && (
                <Button pequeno variante="danger" onClick={() => setDialogo('cancelar')}>
                  Cancelar OS
                </Button>
              )}
            </div>
          </div>
        )}
      </Overlay>

      {dialogo === 'cancelar' && (
        <MotivoDialog
          titulo="Cancelar ordem de serviço"
          descricao="A OS sai do quadro e o cancelamento fica no histórico."
          rotulo="Motivo do cancelamento"
          confirmar="Cancelar OS"
          perigo
          carregando={cancelar.isPending}
          onConfirmar={(m) => cancelar.mutate(m)}
          onFechar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'refacao' && (
        <MotivoDialog
          titulo="Registrar refação"
          descricao='A OS volta para a etapa "Modelo" e a refação entra nos indicadores.'
          rotulo="Motivo da refação"
          confirmar="Registrar refação"
          carregando={refacao.isPending}
          onConfirmar={(m) => refacao.mutate(m)}
          onFechar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'prova_ajuste' && (
        <MotivoDialog
          titulo="Prova devolvida com ajuste"
          descricao='A OS volta para "Estrutura" com o pedido de ajuste registrado.'
          rotulo="O que precisa ser ajustado"
          confirmar="Registrar devolução"
          carregando={prova.isPending}
          onConfirmar={(m) => prova.mutate({ resultado: 'ajuste', motivo: m })}
          onFechar={() => setDialogo(null)}
        />
      )}
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="os-det-bloco">
      <span className="eyebrow">{titulo}</span>
      {children}
    </section>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Anexos({ osId, podeEnviar }: { osId: string; podeEnviar: boolean }) {
  const { avisar } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<keyof typeof TIPOS_ANEXO>('foto');
  const [previa, setPrevia] = useState<{ nome: string; url: string } | null>(null);
  const caminho = { params: { path: { id: osId } } };

  const lista = useQuery({
    queryKey: ['os', 'detalhe', osId, 'anexos'],
    queryFn: () => chamar(api.GET('/ordens-servico/{id}/anexos', caminho)),
    ...SEM_CACHE,
  });
  const enviar = useMutation({
    mutationFn: (arquivo: File) =>
      chamar(
        api.POST('/ordens-servico/{id}/anexos', {
          ...caminho,
          body: { tipo, arquivo: arquivo as unknown as string },
          bodySerializer: (b) => {
            const form = new FormData();
            form.append('tipo', b.tipo);
            form.append('arquivo', b.arquivo as unknown as Blob);
            return form;
          },
        }),
      ),
    onSuccess: () => {
      if (input.current) input.current.value = '';
      lista.refetch();
      avisar('Anexo enviado e armazenado cifrado.', 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
  // Cada visualização pede um link novo (uso único, 60 s).
  const abrir = useMutation({
    mutationFn: (a: OsAnexo) =>
      chamar(
        api.GET('/ordens-servico/{id}/anexos/{anexoId}', {
          params: { path: { id: osId, anexoId: a.id } },
        }),
      ),
    onSuccess: (r) => {
      if (r.mime.startsWith('image/')) setPrevia({ nome: r.nome, url: r.url });
      else window.location.assign(r.url);
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });
  const escolher = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX) {
      avisar('Arquivo acima de 50 MB.', 'erro');
      if (input.current) input.current.value = '';
      return;
    }
    enviar.mutate(f);
  };

  return (
    <Bloco titulo={`Anexos${lista.data?.length ? ` (${lista.data.length})` : ''}`}>
      {lista.data?.map((a) => (
        <div key={a.id} className="row" style={{ gap: 8 }}>
          <IconeClipe tamanho={16} />
          <span style={{ flexGrow: 1, minWidth: 0, fontSize: 13, wordBreak: 'break-word' }}>
            <b>{a.nome}</b>
            <span className="muted">
              {' '}
              · {TIPOS_ANEXO[a.tipo as keyof typeof TIPOS_ANEXO] ?? a.tipo} ·{' '}
              {fmtDataHora(a.criado_em)}
            </span>
          </span>
          <Button
            pequeno
            variante="secondary"
            carregando={abrir.isPending && abrir.variables?.id === a.id}
            onClick={() => abrir.mutate(a)}
          >
            {a.mime.startsWith('image/') ? 'Ver' : 'Baixar'}
          </Button>
        </div>
      ))}
      {lista.data && !lista.data.length && <span className="muted">Nenhum anexo.</span>}
      {podeEnviar && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select
            className="select"
            style={{ width: 150 }}
            aria-label="Tipo do anexo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as keyof typeof TIPOS_ANEXO)}
          >
            {Object.entries(TIPOS_ANEXO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
          <input
            ref={input}
            className="input"
            style={{ flex: '1 1 180px' }}
            type="file"
            accept={ACEITOS}
            aria-label="Arquivo (JPG, PNG, WEBP ou PDF até 50 MB)"
            disabled={enviar.isPending}
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
          />
        </div>
      )}
      {previa && (
        <Overlay titulo={previa.nome} onFechar={() => setPrevia(null)} largo>
          <img className="previa-anexo" src={previa.url} alt={previa.nome} />
        </Overlay>
      )}
    </Bloco>
  );
}
