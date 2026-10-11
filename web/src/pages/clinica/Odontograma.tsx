import type { ReactNode } from 'react';
import type { ProcedimentoPaciente } from '../../api/types';
import { ARCADAS, COR_SITUACAO, nomeDoDente, superior } from '../../lib/odonto';
import { TEXTO_STATUS_PROC } from '../../lib/status';
import { Dente } from './Dente';
import type { EstadoDente } from './odontogramaEstado';

const LEGENDA = [
  ['Realizado', COR_SITUACAO.realizado],
  ['Planejado', COR_SITUACAO.planejado],
  ['Prótese', COR_SITUACAO.protese],
] as const;

const BADGE: Record<ProcedimentoPaciente['status'], string> = {
  planejado: 'b-info',
  em_andamento: 'b-info',
  concluido: 'b-ok',
  cancelado: 'b-mut',
};

interface Props {
  estados: Record<number, EstadoDente>;
  denticao?: 'permanente' | 'deciduo';
  selecionado: number | null;
  onSelecionar: (dente: number) => void;
  /** Controle extra no cabeçalho (ex.: permanente/decídua). */
  controle?: ReactNode;
  /** Botões da barra do dente selecionado. */
  acoes?: (dente: number) => ReactNode;
}

/** Cartão "Odontograma" da prancha Prontuário: duas arcadas de silhuetas + barra do dente selecionado. */
export function Odontograma({
  estados,
  denticao = 'permanente',
  selecionado,
  onSelecionar,
  controle,
  acoes,
}: Props) {
  const arcada = ARCADAS[denticao];
  const botao = (n: number) => {
    const e = estados[n];
    const resumo = e?.procedimentos
      .filter((p) => p.status !== 'cancelado')
      .map((p) => `${p.catalogo.nome} (${TEXTO_STATUS_PROC[p.status]})`);
    const numero = <span className="num od-num">{n}</span>;
    return (
      <button
        key={n}
        type="button"
        className="od-dente"
        aria-pressed={selecionado === n}
        aria-label={`Dente ${n}${resumo?.length ? `: ${resumo.join('; ')}` : ', sem registros'}`}
        onClick={() => onSelecionar(n)}
      >
        {superior(n) && numero}
        <div className={`od-forma ${superior(n) ? 'sup' : 'inf'}`}>
          <Dente numero={n} situacao={e?.situacao ?? null} />
        </div>
        {!superior(n) && numero}
      </button>
    );
  };
  const linha = (dentes: readonly number[]) => {
    const meio = dentes.length / 2;
    const colunas = { gridTemplateColumns: `repeat(${meio}, minmax(0, 1fr))` };
    return (
      <div className="od-arcada">
        <div className="od-lado" style={colunas}>
          {dentes.slice(0, meio).map(botao)}
        </div>
        <span className="od-meio" aria-hidden="true" />
        <div className="od-lado" style={colunas}>
          {dentes.slice(meio).map(botao)}
        </div>
      </div>
    );
  };
  const sel = selecionado ? estados[selecionado] : undefined;
  const p = sel?.principal;

  return (
    <section className="card" style={{ overflow: 'hidden' }}>
      <div className="od-cab">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h2 className="h2">Odontograma</h2>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Toque em um dente para ver ou registrar procedimentos
          </span>
        </div>
        <div className="od-legenda">
          {LEGENDA.map(([nome, cor]) => (
            <span key={nome}>
              <i style={{ background: cor.fundo, border: `1.5px solid ${cor.borda}` }} />
              {nome}
            </span>
          ))}
          {controle}
        </div>
      </div>
      <div className="od-rolagem">
        <div className="od-corpo">
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 2 }}>
            Arcada superior
          </div>
          {linha(arcada.superior)}
          <div className="eyebrow" style={{ fontSize: 11, margin: '10px 0 2px' }}>
            Arcada inferior
          </div>
          {linha(arcada.inferior)}
        </div>
      </div>
      {selecionado ? (
        <div className="od-barra" aria-live="polite">
          <span className="od-selo">
            <span className="num disp">{selecionado}</span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              Dente {selecionado} · {nomeDoDente(selecionado)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {p
                ? [p.catalogo.nome, TEXTO_STATUS_PROC[p.status].toLowerCase(), p.profissional_nome]
                    .filter(Boolean)
                    .join(' · ')
                : 'Sem procedimentos registrados'}
            </span>
          </div>
          {p && <span className={`badge ${BADGE[p.status]}`}>{TEXTO_STATUS_PROC[p.status]}</span>}
          <span style={{ flexGrow: 1 }} />
          {acoes?.(selecionado)}
        </div>
      ) : null}
    </section>
  );
}
