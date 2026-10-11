import { useNavigate } from 'react-router-dom';
import type { Profissional } from '../../api/types';
import { IconeSetaDireita, IconeSetaEsquerda } from '../../components/Icones';
import { Seg } from '../../components/Seg';
import type { Acento } from '../../lib/acentos';

export type Visao = 'dia' | 'semana' | 'quadro';

interface Props {
  visao: Visao;
  onVisao?: (v: 'dia' | 'semana') => void;
  titulo: string;
  onHoje: () => void;
  onMover: (delta: number) => void;
  profissionais: Profissional[];
  acentos: Record<string, Acento>;
  selecionados: Set<string>;
  onAlternar: (id: string) => void;
  contagem: Record<string, number>;
}

/** Barra comum à Agenda e ao Quadro: visão, navegação de datas e filtro de profissionais. */
export function BarraAgenda({
  visao,
  onVisao,
  titulo,
  onHoje,
  onMover,
  profissionais,
  acentos,
  selecionados,
  onAlternar,
  contagem,
}: Props) {
  const navegar = useNavigate();
  const mudar = (v: Visao) => {
    if (v === 'quadro') navegar('/agenda/quadro');
    else if (onVisao) onVisao(v);
    else navegar('/agenda', { state: { visao: v } });
  };
  return (
    <div className="row" style={{ gap: 10, minHeight: 44 }}>
      <Seg
        rotulo="Visão"
        valor={visao}
        onMudar={mudar}
        opcoes={[
          { valor: 'dia', rotulo: 'Dia' },
          { valor: 'semana', rotulo: 'Semana' },
          { valor: 'quadro', rotulo: 'Quadro' },
        ]}
      />
      <button type="button" className="btn sm" style={{ marginLeft: 4 }} onClick={onHoje}>
        Hoje
      </button>
      <div style={{ display: 'flex' }}>
        <button type="button" className="ibtn g" aria-label="Anterior" onClick={() => onMover(-1)}>
          <IconeSetaEsquerda />
        </button>
        <button type="button" className="ibtn g" aria-label="Próximo" onClick={() => onMover(1)}>
          <IconeSetaDireita />
        </button>
      </div>
      <span
        className="disp"
        style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}
        aria-live="polite"
      >
        {titulo}
      </span>
      {profissionais.length > 0 && (
        <div
          className="row"
          style={{ marginLeft: 'auto', gap: 8 }}
          role="group"
          aria-label="Profissionais"
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', marginRight: 2 }}>
            Profissionais
          </span>
          {profissionais.map((p) => {
            const a = acentos[p.id];
            const on = selecionados.has(p.id);
            return (
              <label
                key={p.id}
                className="check prof-chip"
                style={{
                  background: on ? a.fundo : '#fff',
                  border: `1px solid ${on ? a.borda : 'var(--line-strong)'}`,
                  color: on ? a.texto : 'var(--ink-3)',
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onAlternar(p.id)}
                  style={{ accentColor: a.forte }}
                />
                {p.nome}
                <span style={{ fontWeight: 700, opacity: 0.8 }}>{contagem[p.id] ?? 0}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
