import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, chamar } from '../../api/client';
import type { Bloqueio, Consulta, Horario } from '../../api/types';
import { NOME_PAINEL, podeAgendar } from '../../auth/permissoes';
import { useAuth } from '../../auth/useAuth';
import { ErroCarga } from '../../components/Feedback';
import { IconeCheck, IconeMais } from '../../components/Icones';
import { BuscaCabecalho, Cabecalho } from '../../layout/Cabecalho';
import { mapaDeAcentos, type Acento } from '../../lib/acentos';
import { distribuirEmFaixas, lacunas } from '../../lib/agendaLayout';
import {
  agoraEmMinutos,
  dataDe,
  diaDaSemana,
  fmtDiaExtenso,
  fmtHora,
  fmtPeriodo,
  hhmm,
  hoje,
  inicioDaSemana,
  isoLocal,
  minutosDoDia,
  nomeDia,
  somarDias,
} from '../../lib/datas';
import { BarraAgenda } from './BarraAgenda';
import { ConsultaDrawer } from './ConsultaDrawer';
import { NovaConsultaModal } from './NovaConsultaModal';

const PX_HORA = 68; // como na prancha: 68 px por hora, linha a cada 30 min
const PX_MIN = PX_HORA / 60;
const paraMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const INATIVAS = ['cancelada', 'faltou'];

export function AgendaPage() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [params, setParams] = useSearchParams();
  const edita = usuario ? podeAgendar(usuario.perfil) : false;

  const [visao, setVisao] = useState<'dia' | 'semana'>(
    (local.state as { visao?: 'dia' | 'semana' } | null)?.visao ?? 'semana',
  );
  const [ancora, setAncora] = useState(hoje());
  const [fora, setFora] = useState<Set<string>>(new Set()); // profissionais desmarcados
  const [aberta, setAberta] = useState<string | null>(null);
  const [buscaPac, setBuscaPac] = useState('');
  const [novo, setNovo] = useState<{ data?: string; hora?: string; profissional?: string } | null>(
    params.get('novaConsulta') && edita ? {} : null,
  );
  const [agora, setAgora] = useState(agoraEmMinutos());
  const pacientePre = params.get('novaConsulta') ?? undefined;

  useEffect(() => {
    const t = setInterval(() => setAgora(agoraEmMinutos()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dias = useMemo(() => {
    if (visao === 'dia') return [ancora];
    const seg = inicioDaSemana(ancora);
    return Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
  }, [visao, ancora]);
  const inicio = isoLocal(dias[0], '00:00');
  const fim = isoLocal(somarDias(dias[dias.length - 1], 1), '00:00');

  const profs = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => chamar(api.GET('/profissionais')),
  });
  const lista = useMemo(() => profs.data ?? [], [profs.data]);
  const acentos = useMemo(() => mapaDeAcentos(lista), [lista]);
  const selecionados = useMemo(
    () => new Set(lista.filter((p) => !fora.has(p.id)).map((p) => p.id)),
    [lista, fora],
  );

  const consultas = useQuery({
    queryKey: ['consultas', inicio, fim],
    queryFn: () => chamar(api.GET('/consultas', { params: { query: { inicio, fim } } })),
  });
  // Bloqueios: a API só libera para Secretaria/Adm. Clínica.
  const bloqueios = useQuery({
    queryKey: ['bloqueios', inicio, fim],
    enabled: edita,
    queryFn: () => chamar(api.GET('/bloqueios-agenda', { params: { query: { inicio, fim } } })),
  });
  const jornadas = useQueries({
    queries: lista.map((p) => ({
      queryKey: ['horarios', p.id],
      queryFn: () =>
        chamar(api.GET('/profissionais/{id}/horarios', { params: { path: { id: p.id } } })),
      staleTime: 5 * 60_000,
    })),
  });
  const horariosDe = useMemo(() => {
    const m: Record<string, Horario[]> = {};
    lista.forEach((p, i) => {
      m[p.id] = jornadas[i]?.data?.horarios ?? [];
    });
    return m;
  }, [lista, jornadas]);
  const jornadasProntas = jornadas.every((j) => j.data);

  const ativas = (consultas.data ?? []).filter((c) => !INATIVAS.includes(c.status));
  const visiveis = ativas.filter((c) => selecionados.has(c.profissional.id));
  const contagem = ativas.reduce<Record<string, number>>((acc, c) => {
    acc[c.profissional.id] = (acc[c.profissional.id] ?? 0) + 1;
    return acc;
  }, {});

  // Faixa de horas: 08h–18h como na prancha, alargando só se houver algo fora.
  const minutos = visiveis.flatMap((c) => [minutosDoDia(c.inicio), minutosDoDia(c.fim)]);
  const horaIni = Math.min(8, ...minutos.map((m) => Math.floor(m / 60))) * 60;
  const horaFim = Math.max(18, ...minutos.map((m) => Math.ceil(m / 60))) * 60;
  const altura = (horaFim - horaIni) * PX_MIN;
  const topo = (min: number) => (min - horaIni) * PX_MIN;
  const horas = Array.from({ length: (horaFim - horaIni) / 60 }, (_, i) => horaIni + i * 60);

  const mover = (delta: number) =>
    setAncora((a) => somarDias(a, visao === 'semana' ? delta * 7 : delta));
  const alternar = (id: string) =>
    setFora((atual) => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const fecharNovo = () => {
    setNovo(null);
    if (params.has('novaConsulta')) setParams({}, { replace: true });
  };

  if (!usuario) return null;
  const titulo =
    visao === 'dia' ? fmtDiaExtenso(ancora) : fmtPeriodo(dias[0], dias[dias.length - 1]);
  const diaHoje = hoje();
  const mostraAgora = dias.includes(diaHoje) && agora >= horaIni && agora <= horaFim;

  return (
    <>
      <Cabecalho trilha={`${NOME_PAINEL[usuario.perfil]} / Agenda`} titulo="Agenda">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (buscaPac.trim()) navegar('/pacientes', { state: { busca: buscaPac.trim() } });
          }}
        >
          <BuscaCabecalho
            valor={buscaPac}
            onMudar={setBuscaPac}
            placeholder="Buscar paciente"
            largura={280}
          />
        </form>
        {edita && lista.length > 0 && (
          <button type="button" className="btn pri" onClick={() => setNovo({})}>
            <IconeMais />
            Nova consulta
          </button>
        )}
      </Cabecalho>

      <div className="content" style={{ gap: 14, paddingBottom: 14 }}>
        <BarraAgenda
          visao={visao}
          onVisao={setVisao}
          titulo={titulo}
          onHoje={() => setAncora(hoje())}
          onMover={mover}
          profissionais={lista}
          acentos={acentos}
          selecionados={selecionados}
          onAlternar={alternar}
          contagem={contagem}
        />

        {consultas.error && (
          <ErroCarga erro={consultas.error} onTentar={() => consultas.refetch()} />
        )}
        {profs.data && lista.length === 0 && (
          <div className="alert info">
            Nenhum profissional cadastrado. A administração da clínica cadastra em “Usuários”.
          </div>
        )}

        <div className="card ag" aria-busy={consultas.isFetching}>
          <div className="ag-horas">
            <div style={{ height: 68 }} />
            <div style={{ position: 'relative', height: altura }}>
              {horas.map((m) => (
                <span key={m} className="h" style={{ top: topo(m) + 2 }}>
                  {String(m / 60).padStart(2, '0')}h
                </span>
              ))}
              {mostraAgora && (
                <span className="ag-agora-tag" style={{ top: topo(agora) }}>
                  {hhmm(agora)}
                </span>
              )}
            </div>
          </div>

          {dias.map((d) => {
            const doDia = visiveis.filter((c) => dataDe(c.inicio) === d);
            const dow = diaDaSemana(d);
            const janelas = [...selecionados].flatMap((id) =>
              (horariosDe[id] ?? [])
                .filter((h) => h.dia_semana === dow)
                .map((h) => ({ inicio: paraMin(h.inicio), fim: paraMin(h.fim) })),
            );
            const fechado = jornadasProntas && lista.length > 0 && janelas.length === 0;
            return (
              <ColunaDia
                key={d}
                data={d}
                hoje={d === diaHoje}
                fechado={fechado}
                // fora da jornada: só quando há um único profissional marcado (senão as jornadas se somam)
                foraJornada={
                  !fechado && selecionados.size === 1 ? lacunas(janelas, horaIni, horaFim) : []
                }
                consultas={doDia}
                bloqueios={(bloqueios.data ?? []).filter(
                  (b) =>
                    dataDe(b.inicio) <= d &&
                    dataDe(b.fim) >= d &&
                    (!b.profissional_id || selecionados.has(b.profissional_id)),
                )}
                acentos={acentos}
                altura={altura}
                topo={topo}
                faixa={[horaIni, horaFim]}
                agora={d === diaHoje && mostraAgora ? agora : null}
                podeAgendar={edita && lista.length > 0 && !fechado}
                onAbrir={setAberta}
                onNovo={(hora) =>
                  setNovo({
                    data: d,
                    hora,
                    profissional: selecionados.size === 1 ? [...selecionados][0] : undefined,
                  })
                }
              />
            );
          })}
        </div>

        <div className="ag-legenda">
          <span>
            <i style={{ background: '#DCEFEA', border: '1px solid #9ACFC3' }} />
            Confirmada
          </span>
          <span>
            <i style={{ background: '#fff', border: '1.5px dashed var(--ink-3)' }} />
            Aguardando confirmação
          </span>
          <span>
            <i style={{ background: '#DCEFEA', border: '1px solid #9ACFC3', opacity: 0.55 }} />
            Já atendida
          </span>
          <span>
            <i
              style={{
                height: 0,
                borderTop: '2px solid #B4501A',
                borderRadius: 0,
                verticalAlign: 4,
              }}
            />
            Agora
          </span>
        </div>
      </div>

      {aberta && (
        <ConsultaDrawer
          id={aberta}
          podeEditar={edita}
          profissionais={lista}
          onFechar={() => setAberta(null)}
        />
      )}
      {novo && profs.data && (
        <NovaConsultaModal
          profissionais={lista}
          pacienteId={pacientePre}
          profissionalId={novo.profissional}
          data={novo.data}
          hora={novo.hora}
          onFechar={fecharNovo}
        />
      )}
    </>
  );
}

interface ColunaProps {
  data: string;
  hoje: boolean;
  fechado: boolean;
  foraJornada: { inicio: number; fim: number }[];
  consultas: Consulta[];
  bloqueios: Bloqueio[];
  acentos: Record<string, Acento>;
  altura: number;
  topo: (min: number) => number;
  faixa: [number, number];
  agora: number | null;
  podeAgendar: boolean;
  onAbrir: (id: string) => void;
  onNovo: (hora: string) => void;
}

function ColunaDia({
  data,
  hoje: ehHoje,
  fechado,
  foraJornada,
  consultas,
  bloqueios,
  acentos,
  altura,
  topo,
  faixa,
  agora,
  podeAgendar,
  onAbrir,
  onNovo,
}: ColunaProps) {
  const [ini, fim] = faixa;
  const posicionadas = distribuirEmFaixas(
    consultas.map((c) => ({ c, inicio: minutosDoDia(c.inicio), fim: minutosDoDia(c.fim) })),
  );

  const clicar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!podeAgendar || e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.floor((y / PX_MIN + ini) / 30) * 30;
    onNovo(hhmm(Math.min(Math.max(min, ini), fim - 30)));
  };

  return (
    <div className={`ag-dia ${ehHoje ? 'hoje' : ''}`}>
      <div className="ag-dia-cab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sem">{nomeDia(data)}</span>
          <span className="num-dia">{Number(data.slice(8, 10))}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
          {fechado ? 'Fechado' : `${consultas.length} consulta${consultas.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div
        className="ag-corpo"
        style={{ height: altura, cursor: podeAgendar ? 'cell' : 'default' }}
        onClick={clicar}
        role="group"
        aria-label={`${nomeDia(data)} ${Number(data.slice(8, 10))}`}
      >
        {fechado && <div className="ag-fechado" style={{ top: 0, height: altura }} />}
        {foraJornada.map((l) => (
          <div
            key={l.inicio}
            className="ag-fora"
            style={{ top: topo(l.inicio), height: (l.fim - l.inicio) * PX_MIN }}
          />
        ))}
        {bloqueios.map((b) => {
          const i = Math.max(ini, dataDe(b.inicio) < data ? 0 : minutosDoDia(b.inicio));
          const f = Math.min(fim, dataDe(b.fim) > data ? 1440 : minutosDoDia(b.fim));
          if (f <= i) return null;
          return (
            <div
              key={b.id}
              className="ag-bloqueio"
              style={{ top: topo(i), height: (f - i) * PX_MIN }}
              title={b.motivo}
            >
              {b.motivo}
              {b.profissional_nome ? ` · ${b.profissional_nome}` : ''}
            </div>
          );
        })}
        {agora !== null && <div className="ag-agora" style={{ top: topo(agora) }} />}
        {posicionadas.map(({ item, faixa: f, faixas }) => {
          const { c } = item;
          const a = acentos[c.profissional.id] ?? Object.values(acentos)[0];
          const h = Math.max((item.fim - item.inicio) * PX_MIN - 2, 24);
          const classe =
            c.status === 'agendada' ? 'aguardando' : c.status === 'concluida' ? 'atendida' : '';
          return (
            <button
              key={c.id}
              type="button"
              className={`ag-ev ${classe}`}
              style={{
                top: topo(item.inicio) + 2,
                height: h,
                left: `calc(4px + (100% - 8px) * ${f / faixas})`,
                width: `calc((100% - 8px) / ${faixas} - ${faixas > 1 ? 3 : 0}px)`,
                ['--ev-fundo' as string]: a?.fundo,
                ['--ev-borda' as string]: a?.borda,
                ['--ev-texto' as string]: a?.texto,
                ['--ev-forte' as string]: a?.forte,
              }}
              onClick={() => onAbrir(c.id)}
              aria-label={`${fmtHora(c.inicio)} ${c.paciente.nome}, ${c.status}`}
            >
              {h < 46 ? (
                // consulta curta: hora e nome na mesma linha, como na prancha
                <span className="nm" style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span className="hr">{fmtHora(c.inicio)}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.paciente.nome}
                  </span>
                </span>
              ) : (
                <>
                  <span className="hr">
                    {fmtHora(c.inicio)} – {fmtHora(c.fim)}
                  </span>
                  <span className="nm">{c.paciente.nome}</span>
                  {h > 62 && (
                    <span className="pr">{c.procedimento_previsto ?? c.profissional.nome}</span>
                  )}
                </>
              )}
              {c.status !== 'agendada' && (
                <span className="marca">
                  <IconeCheck tamanho={13} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
