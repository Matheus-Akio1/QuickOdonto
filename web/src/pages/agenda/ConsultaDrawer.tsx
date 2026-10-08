import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Profissional } from '../../api/types';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Carregando, ErroCarga } from '../../components/Feedback';
import { Overlay } from '../../components/Overlay';
import { StatusConsulta } from '../../components/StatusBadge';
import {
  dataDe,
  fmtDataBR,
  fmtDataHora,
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
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>
              <Link to={`/pacientes/${c.paciente.id}`}>{c.paciente.nome}</Link>
            </h3>
            <StatusConsulta status={c.status} />
          </div>
          <dl className="dl">
            <dt>Quando</dt>
            <dd>
              {fmtDataBR(dataDe(c.inicio))} · {fmtHora(c.inicio)} – {fmtHora(c.fim)}
            </dd>
            <dt>Profissional</dt>
            <dd>{c.profissional.nome}</dd>
            <dt>Cadeira</dt>
            <dd>{c.cadeira}</dd>
            <dt>Procedimento</dt>
            <dd>{c.procedimento_previsto ?? '—'}</dd>
            {c.motivo_cancelamento && (
              <>
                <dt>Motivo</dt>
                <dd>{c.motivo_cancelamento}</dd>
              </>
            )}
          </dl>

          {podeEditar && (
            <div className="row">
              {proximo && (
                <Button
                  carregando={mudar.isPending}
                  onClick={() => mudar.mutate({ id, status: proximo as never })}
                >
                  {ROTULO_ACAO[proximo]}
                </Button>
              )}
              {PODE_FALTAR.includes(c.status) && (
                <Button variante="secondary" onClick={() => mudar.mutate({ id, status: 'faltou' })}>
                  Marcar falta
                </Button>
              )}
              {PODE_REAGENDAR.includes(c.status) && (
                <Button variante="secondary" onClick={() => setReagendando(true)}>
                  Reagendar
                </Button>
              )}
              {PODE_CANCELAR.includes(c.status) && (
                <Button variante="secondary" onClick={() => setCancelando(true)}>
                  Cancelar consulta
                </Button>
              )}
              {PODE_REAGENDAR.includes(c.status) && (
                <Button
                  variante="ghost"
                  carregando={whatsapp.isPending}
                  onClick={() => whatsapp.mutate()}
                >
                  Lembrete no WhatsApp
                </Button>
              )}
            </div>
          )}

          <section>
            <h3 style={{ marginBottom: 8 }}>Histórico</h3>
            <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
              {c.historico?.map((h, i) => (
                <li key={i}>
                  <strong>
                    {h.de_status && h.de_status !== h.para_status
                      ? `${h.de_status} → ${h.para_status}`
                      : h.para_status}
                  </strong>
                  <br />
                  <span className="muted">
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
