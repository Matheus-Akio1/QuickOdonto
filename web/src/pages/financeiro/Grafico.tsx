import type { FluxoCaixa } from '../../api/types';
import { fmtDataCurta } from '../../lib/datas';
import { tetoDoEixo } from '../../lib/financeiro';
import { fmtMoeda } from '../../lib/moeda';

const milhar = (v: number) =>
  (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: v < 4000 ? 1 : 0 });

/**
 * Receitas × despesas por semana (prancha "Fluxo de caixa"): barra cheia = realizado,
 * barra tracejada em cima = ainda em aberto. Desenhado em CSS — sem biblioteca de gráficos.
 */
export function Grafico({ semanas }: { semanas: FluxoCaixa['semanas'] }) {
  const maior = Math.max(
    ...semanas.map((s) => Math.max(s.receitas + s.a_receber, s.despesas + s.a_pagar)),
    0,
  );
  const teto = tetoDoEixo(maior);
  const pct = (v: number) => `${(v / teto) * 100}%`;
  return (
    <div className="fin-graf">
      <div className="fin-eixo" aria-hidden="true">
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <span key={f}>{milhar(teto * f)}</span>
        ))}
      </div>
      <div className="fin-area">
        <div className="fin-linhas" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} />
          ))}
        </div>
        <div className="fin-semanas">
          {semanas.map((s) => (
            <div key={s.inicio} className="fin-semana">
              <div
                className="fin-barras"
                role="img"
                aria-label={`${fmtDataCurta(s.inicio)} a ${fmtDataCurta(s.fim)}: receitas ${fmtMoeda(s.receitas)}, a receber ${fmtMoeda(s.a_receber)}, despesas ${fmtMoeda(s.despesas)}, a pagar ${fmtMoeda(s.a_pagar)}`}
              >
                <div className="fin-pilha">
                  <div className="solida rec" style={{ height: pct(s.receitas) }} />
                  {s.a_receber > 0 && (
                    <div className="a-rec" style={{ height: pct(s.a_receber) }} />
                  )}
                </div>
                <div className="fin-pilha">
                  <div className="solida desp" style={{ height: pct(s.despesas) }} />
                  {s.a_pagar > 0 && <div className="a-pag" style={{ height: pct(s.a_pagar) }} />}
                </div>
              </div>
              <small>
                {s.inicio === s.fim
                  ? fmtDataCurta(s.inicio)
                  : `${s.inicio.slice(8)}–${fmtDataCurta(s.fim)}`}
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LegendaGrafico() {
  return (
    <div className="fin-legenda">
      <span>
        <i style={{ background: '#0F6B63' }} />
        Receitas
      </span>
      <span>
        <i style={{ background: '#DE6B2F' }} />
        Despesas
      </span>
      <span>
        <i className="a-rec" />A receber
      </span>
      <span>
        <i className="a-pag" />A pagar
      </span>
    </div>
  );
}
