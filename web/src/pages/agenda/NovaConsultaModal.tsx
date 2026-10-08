import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, chamar, mensagemDeErro } from '../../api/client';
import type { Profissional } from '../../api/types';
import { Button } from '../../components/Button';
import { Campo } from '../../components/Campo';
import { Overlay } from '../../components/Overlay';
import { fmtHora, hhmm, hoje, isoLocal } from '../../lib/datas';
import { useToast } from '../../toast/useToast';

interface Props {
  profissionais: Profissional[];
  pacienteId?: string;
  profissionalId?: string;
  data?: string;
  hora?: string;
  onFechar: () => void;
}

const DURACOES = [15, 30, 45, 60, 90, 120];
const paraMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export function NovaConsultaModal({
  profissionais,
  pacienteId,
  profissionalId,
  data,
  hora,
  onFechar,
}: Props) {
  const qc = useQueryClient();
  const { avisar } = useToast();
  const [paciente, setPaciente] = useState<{ id: string; nome: string } | null>(null);
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [profissional, setProfissional] = useState(profissionalId || profissionais[0]?.id || '');
  const [dia, setDia] = useState(data || hoje());
  const [inicio, setInicio] = useState(hora || '');
  const [duracao, setDuracao] = useState(30);
  const [cadeira, setCadeira] = useState(1);
  const [procedimento, setProcedimento] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  // Paciente pré-selecionado (vindo da ficha): busca só o nome para exibir.
  const pre = useQuery({
    queryKey: ['paciente', pacienteId],
    enabled: Boolean(pacienteId),
    queryFn: () => chamar(api.GET('/pacientes/{id}', { params: { path: { id: pacienteId! } } })),
  });
  useEffect(() => {
    if (pre.data) setPaciente({ id: pre.data.id, nome: pre.data.nome });
  }, [pre.data]);

  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const resultados = useQuery({
    queryKey: ['pacientes', 'seletor', termo],
    enabled: termo.length >= 2 && !paciente,
    queryFn: () => chamar(api.POST('/pacientes/buscar', { body: { busca: termo, limite: 6 } })),
  });

  const livres = useQuery({
    queryKey: ['disponibilidade', profissional, dia, duracao],
    enabled: Boolean(profissional && dia),
    queryFn: () =>
      chamar(
        api.GET('/agenda/disponibilidade', {
          params: { query: { profissional, data: dia, duracao } },
        }),
      ),
  });

  const criar = useMutation({
    mutationFn: () =>
      chamar(
        api.POST('/consultas', {
          body: {
            paciente_id: paciente!.id,
            profissional_id: profissional,
            cadeira,
            inicio: isoLocal(dia, inicio),
            fim: isoLocal(dia, hhmm(paraMin(inicio) + duracao)),
            procedimento_previsto: procedimento.trim() || null,
          },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] });
      qc.invalidateQueries({ queryKey: ['disponibilidade'] });
      qc.invalidateQueries({ queryKey: ['paciente'] });
      avisar('Consulta agendada.', 'ok');
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const podeSalvar = Boolean(paciente && profissional && dia && /^\d{2}:\d{2}$/.test(inicio));

  return (
    <Overlay
      titulo="Nova consulta"
      descricao="Escolha o paciente, o profissional e um horário livre."
      onFechar={onFechar}
      largo
      rodape={
        <>
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            carregando={criar.isPending}
            disabled={!podeSalvar}
            onClick={() => {
              setErro(null);
              criar.mutate();
            }}
          >
            Agendar
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

        <div className="field">
          <span className="label">Paciente</span>
          {paciente ? (
            <div className="row">
              <strong>{paciente.nome}</strong>
              {!pacienteId && (
                <Button variante="ghost" pequeno onClick={() => setPaciente(null)}>
                  Trocar
                </Button>
              )}
            </div>
          ) : (
            <>
              <input
                className="input"
                type="search"
                aria-label="Buscar paciente por nome, celular ou CPF"
                placeholder="Buscar por nome, celular ou CPF"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {resultados.data && (
                <ul
                  role="listbox"
                  aria-label="Pacientes encontrados"
                  className="stack"
                  style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}
                >
                  {resultados.data.itens.length === 0 && (
                    <li className="muted">Nenhum paciente encontrado.</li>
                  )}
                  {resultados.data.itens.map((p) => (
                    <li key={p.id}>
                      <Button
                        variante="secondary"
                        className="btn-sm"
                        style={{ width: '100%', justifyContent: 'space-between' }}
                        onClick={() => setPaciente({ id: p.id, nome: p.nome })}
                      >
                        <span>{p.nome}</span>
                        <span className="muted mono">{p.celular ?? `#${p.numero_prontuario}`}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

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
          <Campo label="Duração">
            {(p) => (
              <select
                {...p}
                className="select"
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value))}
              >
                {DURACOES.map((d) => (
                  <option key={d} value={d}>
                    {d} min
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
        </div>

        <div className="field">
          <span className="label" id="rotulo-livres">
            Horários livres
          </span>
          {livres.isLoading ? (
            <span className="muted">Buscando horários…</span>
          ) : livres.error ? (
            <span className="error">{mensagemDeErro(livres.error)}</span>
          ) : !livres.data?.livres.length ? (
            <span className="muted">
              Sem horários livres neste dia para essa duração. Você ainda pode digitar um horário.
            </span>
          ) : (
            <div className="slots" role="group" aria-labelledby="rotulo-livres">
              {livres.data.livres.map((s) => {
                const h = fmtHora(s.inicio);
                return (
                  <button
                    key={s.inicio}
                    type="button"
                    className="slot"
                    aria-pressed={inicio === h}
                    onClick={() => setInicio(h)}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="form-grid">
          <Campo
            label="Início"
            dica={
              inicio ? `Termina às ${hhmm(paraMin(inicio) + duracao)}` : 'Escolha acima ou digite.'
            }
          >
            {(p) => (
              <input
                {...p}
                className="input"
                type="time"
                step={300}
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            )}
          </Campo>
          <Campo label="Procedimento previsto">
            {(p) => (
              <input
                {...p}
                className="input"
                value={procedimento}
                onChange={(e) => setProcedimento(e.target.value)}
                maxLength={200}
              />
            )}
          </Campo>
        </div>
      </div>
    </Overlay>
  );
}
