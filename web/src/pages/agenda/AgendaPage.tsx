import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import type { Consulta, Horario } from '../../api/types';
import { podeAgendar } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { ErroCarga } from '../../components/Feedback';
import { distribuirEmFaixas, lacunas } from '../../lib/agendaLayout';
import {
  dataDe,
  diaDaSemana,
  fmtDataCurta,
  fmtHora,
  hhmm,
  hoje,
  inicioDaSemana,
  isoLocal,
  minutosDoDia,
  nomeDia,
  somarDias,
} from '../../lib/datas';
import { ConsultaDrawer } from './ConsultaDrawer';
import { NovaConsultaModal } from './NovaConsultaModal';

const HORA_INI = 7 * 60;
const HORA_FIM = 19 * 60;
const PX_MIN = 1.05;
const ALTURA = (HORA_FIM - HORA_INI) * PX_MIN;
const topo = (min: number) => (min - HORA_INI) * PX_MIN;
const horasGrade = Array.from(
  { length: (HORA_FIM - HORA_INI) / 60 + 1 },
  (_, i) => HORA_INI + i * 60,
);

type Visao = 'semana' | 'dia';

export function AgendaPage() {
  const { usuario } = useAuth();
  const [params, setParams] = useSearchParams();
  const edita = usuario ? podeAgendar(usuario.perfil) : false;

  const [visao, setVisao] = useState<Visao>('semana');
  const [ancora, setAncora] = useState(hoje());
  const [profissional, setProfissional] = useState('');
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ data?: string; hora?: string } | null>(
    params.get('novaConsulta') && edita ? {} : null,
  );
  const pacientePre = params.get('novaConsulta') ?? undefined;

  const dias = useMemo(() => {
    if (visao === 'dia') return [ancora];
    const seg = inicioDaSemana(ancora);
    return Array.from({ length: 6 }, (_, i) => somarDias(seg, i)); // seg–sáb
  }, [visao, ancora]);
  const inicio = isoLocal(dias[0], '00:00');
  const fim = isoLocal(somarDias(dias[dias.length - 1], 1), '00:00');

  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim, profissional],
    queryFn: () =>
      chamar(
        api.GET('/consultas', {
          params: { query: { inicio, fim, profissional: profissional || undefined } },
        }),
      ),
  });
  // Bloqueios: a API só libera para Secretaria/Adm. Clínica.
  const bloqueios = useQuery({
    queryKey: ['bloqueios', inicio, fim, profissional],
    enabled: edita,
    queryFn: () =>
      chamar(
        api.GET('/bloqueios-agenda', {
          params: { query: { inicio, fim, profissional: profissional || undefined } },
        }),
      ),
  });
  const jornada = useQuery({
    queryKey: ['horarios', profissional],
    enabled: Boolean(profissional),
    queryFn: () =>
      chamar(api.GET('/profissionais/{id}/horarios', { params: { path: { id: profissional } } })),
  });

  const mover = (delta: number) =>
    setAncora((a) => somarDias(a, visao === 'semana' ? delta * 7 : delta));
  const fecharNovo = () => {
    setNovo(null);
    if (params.has('novaConsulta')) setParams({}, { replace: true });
  };

  const titulo =
    visao === 'dia'
      ? `${nomeDia(ancora)}, ${fmtDataCurta(ancora)}`
      : `${fmtDataCurta(dias[0])} a ${fmtDataCurta(dias[dias.length - 1])}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Agenda</h1>
          <p>
            {edita ? 'Clique num horário livre para agendar.' : 'Visualização somente leitura.'}
          </p>
        </div>
        {edita && profs.data?.length ? (
          <Button onClick={() => setNovo({})}>Nova consulta</Button>
        ) : null}
      </div>

      <div className="toolbar">
        <div className="row">
          <Button variante="secondary" aria-label="Período anterior" onClick={() => mover(-1)}>
            ‹
          </Button>
          <Button variante="secondary" onClick={() => setAncora(hoje())}>
            Hoje
          </Button>
          <Button variante="secondary" aria-label="Próximo período" onClick={() => mover(1)}>
            ›
          </Button>
          <strong aria-live="polite" style={{ minWidth: 150 }}>
            {titulo}
          </strong>
        </div>
        <div className="row" role="group" aria-label="Visão">
          <Button
            variante={visao === 'dia' ? 'primary' : 'secondary'}
            onClick={() => setVisao('dia')}
          >
            Dia
          </Button>
          <Button
            variante={visao === 'semana' ? 'primary' : 'secondary'}
            onClick={() => setVisao('semana')}
          >
            Semana
          </Button>
        </div>
        <div className="grow" />
        <label className="sr-only" htmlFor="filtro-prof">
          Profissional
        </label>
        <select
          id="filtro-prof"
          className="select"
          style={{ width: 'auto' }}
          value={profissional}
          onChange={(e) => setProfissional(e.target.value)}
        >
          <option value="">Todos os profissionais</option>
          {profs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={mostrarInativas}
            onChange={(e) => setMostrarInativas(e.target.checked)}
          />
          Mostrar faltas e canceladas
        </label>
      </div>

      {profs.data && (
        <div className="legenda" style={{ marginBottom: 12 }}>
          {profs.data.map((p) => (
            <span key={p.id}>
              <i style={{ background: p.cor_agenda }} />
              {p.nome}
            </span>
          ))}
          <span>
            <i
              style={{
                background: 'repeating-linear-gradient(135deg,#f3dfdb 0 3px,#fff5f3 3px 6px)',
                border: '1px dashed #c98c83',
              }}
            />
            Bloqueio
          </span>
          {profissional && (
            <span>
              <i
                style={{
                  background: 'var(--neutral-soft)',
                  border: '1px solid var(--line-strong)',
                }}
              />
              Fora da jornada
            </span>
          )}
        </div>
      )}

      {consultas.error && <ErroCarga erro={consultas.error} onTentar={() => consultas.refetch()} />}
      {profs.data && profs.data.length === 0 && (
        <div className="alert info" style={{ marginBottom: 12 }}>
          Nenhum profissional cadastrado. A administração da clínica cadastra em “Equipe e
          auditoria”.
        </div>
      )}

      <div className="agenda-card" aria-busy={consultas.isFetching}>
        <div className="semana" style={{ ['--dias' as string]: dias.length }}>
          <div className="semana-cab" style={{ borderLeft: 0 }} />
          {dias.map((d) => (
            <div key={d} className={`semana-cab ${d === hoje() ? 'hoje' : ''}`}>
              <small>{nomeDia(d)}</small>
              {fmtDataCurta(d)}
            </div>
          ))}

          <div className="horas" style={{ height: ALTURA }}>
            {horasGrade.map((m) => (
              <span key={m} style={{ top: topo(m) }}>
                {hhmm(m)}
              </span>
            ))}
          </div>

          {dias.map((d) => (
            <ColunaDia
              key={d}
              data={d}
              consultas={(consultas.data ?? []).filter(
                (c) =>
                  fmtData(c.inicio) === d &&
                  (mostrarInativas || (c.status !== 'cancelada' && c.status !== 'faltou')),
              )}
              bloqueios={(bloqueios.data ?? []).filter(
                (b) => fmtData(b.inicio) <= d && fmtData(b.fim) >= d,
              )}
              horarios={profissional ? (jornada.data?.horarios ?? null) : null}
              podeAgendar={edita && Boolean(profs.data?.length)}
              onAbrir={setAberta}
              onNovo={(hora) => setNovo({ data: d, hora })}
            />
          ))}
        </div>
      </div>

      {aberta && (
        <ConsultaDrawer
          id={aberta}
          podeEditar={edita}
          profissionais={profs.data ?? []}
          onFechar={() => setAberta(null)}
        />
      )}
      {novo && profs.data && (
        <NovaConsultaModal
          profissionais={profs.data}
          pacienteId={pacientePre}
          profissionalId={profissional || undefined}
          data={novo.data}
          hora={novo.hora}
          onFechar={fecharNovo}
        />
      )}
    </div>
  );
}

const fmtData = dataDe;

interface ColunaProps {
  data: string;
  consultas: Consulta[];
  bloqueios: {
    id: string;
    inicio: string;
    fim: string;
    motivo: string;
    profissional_nome?: string | null;
  }[];
  horarios: Horario[] | null;
  podeAgendar: boolean;
  onAbrir: (id: string) => void;
  onNovo: (hora: string) => void;
}

function ColunaDia({
  data,
  consultas,
  bloqueios,
  horarios,
  podeAgendar,
  onAbrir,
  onNovo,
}: ColunaProps) {
  const dow = diaDaSemana(data);
  const fora = horarios
    ? lacunas(
        horarios
          .filter((h) => h.dia_semana === dow)
          .map((h) => ({
            inicio: Number(h.inicio.slice(0, 2)) * 60 + Number(h.inicio.slice(3)),
            fim: Number(h.fim.slice(0, 2)) * 60 + Number(h.fim.slice(3)),
          })),
        HORA_INI,
        HORA_FIM,
      )
    : [];

  const posicionadas = distribuirEmFaixas(
    consultas.map((c) => ({ c, inicio: minutosDoDia(c.inicio), fim: minutosDoDia(c.fim) })),
  );

  const clicar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!podeAgendar || e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.floor((y / PX_MIN + HORA_INI) / 30) * 30;
    onNovo(hhmm(Math.min(Math.max(min, HORA_INI), HORA_FIM - 30)));
  };

  return (
    <div
      className="coluna-dia"
      style={{ height: ALTURA, cursor: podeAgendar ? 'cell' : 'default' }}
      onClick={clicar}
      role="group"
      aria-label={`Dia ${fmtDataCurta(data)}`}
    >
      {horasGrade.map((m) => (
        <div key={m} className="linha-hora" style={{ top: topo(m) }} />
      ))}
      {fora.map((l) => (
        <div
          key={l.inicio}
          className="fora-jornada"
          style={{ top: topo(l.inicio), height: (l.fim - l.inicio) * PX_MIN }}
        />
      ))}
      {bloqueios.map((b) => {
        const ini = Math.max(HORA_INI, fmtData(b.inicio) < data ? 0 : minutosDoDia(b.inicio));
        const f = Math.min(HORA_FIM, fmtData(b.fim) > data ? 1440 : minutosDoDia(b.fim));
        if (f <= ini) return null;
        return (
          <div
            key={b.id}
            className="bloqueio"
            style={{ top: topo(ini), height: (f - ini) * PX_MIN }}
            title={b.motivo}
          >
            {b.motivo}
            {b.profissional_nome ? ` · ${b.profissional_nome}` : ''}
          </div>
        );
      })}
      {posicionadas.map(({ item, faixa, faixas }) => {
        const { c } = item;
        const largura = 100 / faixas;
        const altura = Math.max((item.fim - item.inicio) * PX_MIN, 22);
        return (
          <button
            key={c.id}
            type="button"
            className={`evento ${c.status}`}
            style={{
              top: topo(item.inicio),
              height: altura,
              left: `calc(${faixa * largura}% + 2px)`,
              width: `calc(${largura}% - 4px)`,
              ['--cor' as string]: c.profissional.cor_agenda,
            }}
            onClick={() => onAbrir(c.id)}
            aria-label={`${fmtHora(c.inicio)} ${c.paciente.nome}, ${c.status}`}
          >
            <strong>
              {fmtHora(c.inicio)} {c.paciente.nome}
            </strong>
            {altura > 40 && <span>{c.procedimento_previsto ?? c.profissional.nome}</span>}
          </button>
        );
      })}
    </div>
  );
}
