import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Profissional } from '../../api/types';
import { podeVerProntuario } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import {
  IconeAbrirFicha,
  IconeAgenda,
  IconeCheck,
  IconeReagendar,
  IconeRelogio,
  IconeWhatsapp,
} from '../../components/Icones';
import { StatusConsulta } from '../../components/StatusBadge';
import { TEXTO_STATUS_CONSULTA } from '../../lib/status';
import { Avatar } from '../../components/Avatar';
import { mapaDeAcentos } from '../../lib/acentos';
import {
  dataDe,
  fmtDataHora,
  fmtDiaExtenso,
  fmtDuracao,
  fmtHora,
  hhmm,
  isoLocal,
  minutosDoDia,
} from '../../lib/datas';
import { useToast } from '../../toast/useToast';
import { CancelarDialog } from './CancelarDialog';
import { PODE_CANCELAR, PODE_FALTAR, PODE_REAGENDAR, PROXIMO, ROTULO_ACAO } from './fluxo';
import { useMudarStatus } from './useMudarStatus';

interface Props {
  id: string;
  podeEditar: boolean;
  profissionais: Profissional[];
  onFechar: () => void;
}

export function ConsultaDrawer({ id, podeEditar, profissionais, onFechar }: Props) {
  const { avisar } = useToast();
  const { usuario } = useAuth();
  const [cancelando, setCancelando] = useState(false);
  const [reagendando, setReagendando] = useState(false);
  const mudar = useMudarStatus();

  const consulta = useQuery({
    queryKey: ['consulta', id],
    queryFn: () => chamar(api.GET('/consultas/{id}', { params: { path: { id } } })),
  });

  // O link só é montado no servidor (usa o celular completo) e abre em nova aba; nada é guardado no front.
  const whatsapp = useMutation({
    mutationFn: () =>
      chamar(api.GET('/consultas/{id}/lembrete-whatsapp', { params: { path: { id } } })),
    onSuccess: ({ url, celular }) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      avisar(`Lembrete aberto no WhatsApp (${celular}).`, 'ok');
    },
    onError: (e) => avisar(mensagemDeErro(e), 'erro'),
  });

  const c = consulta.data;
  const proximo = c ? PROXIMO[c.status] : undefined;
  const acento = c ? mapaDeAcentos(profissionais)[c.profissional.id] : undefined;

  return (
    <Overlay
      tipo="drawer"
      titulo="Consulta"
      onFechar={onFechar}
      rodape={
        <Button variante="secondary" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      {consulta.error ? (
        <ErroCarga erro={consulta.error} onTentar={() => consulta.refetch()} />
      ) : !c ? (
        <Carregando />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar nome={c.paciente.nome} tamanho={46} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <h3 className="h3" style={{ fontSize: 20 }}>
                {c.paciente.nome}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  {c.procedimento_previsto ?? 'Consulta'}
                </span>
                <span
                  className="q-prof"
                  style={{ marginLeft: 0, background: acento?.fundo, color: acento?.texto }}
                >
                  {c.profissional.nome}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <IconeAgenda tamanho={16} />
              {fmtDiaExtenso(dataDe(c.inicio))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <IconeRelogio tamanho={16} />
              <span className="num">
                {fmtHora(c.inicio)} – {fmtHora(c.fim)}
              </span>
              <span style={{ color: 'var(--ink-3)' }}>
                · {fmtDuracao(minutosDoDia(c.fim) - minutosDoDia(c.inicio))} · cadeira {c.cadeira}
              </span>
            </div>
          </div>
          <div>
            <StatusConsulta status={c.status} />
          </div>
          {c.motivo_cancelamento && (
            <div className="alert info">Motivo do cancelamento: {c.motivo_cancelamento}</div>
          )}

          {podeEditar && proximo && (
            <button
              type="button"
              className="btn pri"
              style={{ height: 44, width: '100%' }}
              disabled={mudar.isPending}
              onClick={() => mudar.mutate({ id, status: proximo as never })}
            >
              <IconeCheck />
              {ROTULO_ACAO[proximo]}
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {podeEditar && PODE_REAGENDAR.includes(c.status) && (
              <button
                type="button"
                className="btn sm"
                style={{ flexGrow: 1 }}
                disabled={whatsapp.isPending}
                onClick={() => whatsapp.mutate()}
              >
                <IconeWhatsapp />
                Lembrete no WhatsApp
              </button>
            )}
            {podeEditar && PODE_REAGENDAR.includes(c.status) && (
              <button
                type="button"
                className="btn sm"
                style={{ flexGrow: 1 }}
                onClick={() => setReagendando(true)}
              >
                <IconeReagendar />
                Reagendar
              </button>
            )}
            {usuario && podeVerProntuario(usuario.perfil) ? (
              <Link
                className="btn sm"
                style={{ flexGrow: 1 }}
                to={`/clinica/prontuario/${c.paciente.id}`}
              >
                <IconeAbrirFicha />
                Abrir prontuário
              </Link>
            ) : (
              <Link className="btn sm" style={{ flexGrow: 1 }} to={`/pacientes/${c.paciente.id}`}>
                <IconeAbrirFicha />
                Abrir ficha
              </Link>
            )}
          </div>
          {podeEditar && (PODE_FALTAR.includes(c.status) || PODE_CANCELAR.includes(c.status)) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {PODE_FALTAR.includes(c.status) && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => mudar.mutate({ id, status: 'faltou' })}
                >
                  Marcar falta
                </button>
              )}
              {PODE_CANCELAR.includes(c.status) && (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ color: 'var(--bad)' }}
                  onClick={() => setCancelando(true)}
                >
                  Cancelar consulta
                </button>
              )}
            </div>
          )}

          <section style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Histórico
            </div>
            <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
              {c.historico?.map((h, i) => (
                <li key={i}>
                  <strong style={{ fontSize: 14 }}>{TEXTO_STATUS_CONSULTA[h.para_status]}</strong>
                  <br />
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    {fmtDataHora(h.em)} · {h.usuario_nome ?? 'sistema'}
                    {h.observacao ? ` · ${h.observacao}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {cancelando && <CancelarDialog id={id} onFechar={() => setCancelando(false)} />}
      {reagendando && c && (
        <ReagendarDialog
          id={id}
          profissionais={profissionais}
          atual={{
            profissional: c.profissional.id,
            inicio: c.inicio,
            fim: c.fim,
            cadeira: c.cadeira,
          }}
          onFechar={() => setReagendando(false)}
        />
      )}
    </Overlay>
  );
}

function ReagendarDialog({
  id,
  profissionais,
  atual,
  onFechar,
}: {
  id: string;
  profissionais: Profissional[];
  atual: { profissional: string; inicio: string; fim: string; cadeira: number };
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const duracao = minutosDoDia(atual.fim) - minutosDoDia(atual.inicio);
  const [profissional, setProfissional] = useState(atual.profissional);
  const [dia, setDia] = useState(dataDe(atual.inicio));
  const [hora, setHora] = useState(fmtHora(atual.inicio));
  const [cadeira, setCadeira] = useState(atual.cadeira);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        api.PATCH('/consultas/{id}', {
          params: { path: { id } },
          body: {
            profissional_id: profissional,
            cadeira,
            inicio: isoLocal(dia, hora),
            fim: isoLocal(
              dia,
              hhmm(Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + duracao),
            ),
          },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] });
      qc.invalidateQueries({ queryKey: ['consulta'] });
      qc.invalidateQueries({ queryKey: ['disponibilidade'] });
      avisar('Consulta reagendada.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  return (
    <Overlay
      titulo="Reagendar consulta"
      descricao={`Duração mantida: ${duracao} min.`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Voltar
          </Button>
          <Button
            carregando={salvar.isPending}
            onClick={() => {
              setErro(null);
              salvar.mutate();
            }}
          >
            Reagendar
          </Button>
        </>
      }
    >
      <div className="stack">
        {erro && (
          <div className="alert" role="alert">
            {erro}
          </div>
        )}
        <div className="form-grid">
          <Campo label="Profissional">
            {(p) => (
              <select
                {...p}
                className="select"
                value={profissional}
                onChange={(e) => setProfissional(e.target.value)}
              >
                {profissionais.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.nome}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo label="Cadeira">
            {(p) => (
              <input
                {...p}
                className="input"
                type="number"
                min={1}
                max={20}
                value={cadeira}
                onChange={(e) => setCadeira(Number(e.target.value) || 1)}
              />
            )}
          </Campo>
          <Campo label="Data">
            {(p) => (
              <input
                {...p}
                className="input"
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              />
            )}
          </Campo>
          <Campo label="Início">
            {(p) => (
              <input
                {...p}
                className="input"
                type="time"
                step={300}
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            )}
          </Campo>
        </div>
      </div>
    </Overlay>
  );
}
