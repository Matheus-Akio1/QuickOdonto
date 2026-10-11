import {
  COR_SITUACAO,
  formaDoDente,
  superior,
  type FormaDente,
  type Situacao,
} from '../../lib/odonto';

// Silhuetas do protótipo, desenhadas com a coroa para cima; na arcada superior o desenho é espelhado.
const FORMAS: Record<FormaDente, { l: number; a: number; d: string }> = {
  molar: {
    l: 46,
    a: 42,
    d: 'M 2.2 4.8 C 2.2 0.8 13.2 0.0 22.0 2.4 C 30.8 0.0 41.8 0.8 41.8 4.8 C 41.8 16.0 40.5 22.0 37.4 30.0 C 35.2 38.0 29.9 40.0 27.3 32.0 C 25.5 26.4 24.2 24.0 22.0 24.0 C 19.8 24.0 18.5 26.4 16.7 32.0 C 14.1 40.0 8.8 38.0 6.6 30.0 C 3.5 22.0 2.2 16.0 2.2 4.8 Z',
  },
  premolar: {
    l: 34,
    a: 48,
    d: 'M 2.6 2.3 C 8.0 0.0 24.0 0.0 29.4 2.3 C 32.0 14.7 30.4 25.3 28.2 31.3 C 25.6 37.7 22.4 46.0 16.0 46.0 C 9.6 46.0 6.4 37.7 3.8 31.3 C 1.6 25.3 0.0 14.7 2.6 2.3 Z',
  },
  canino: {
    l: 32,
    a: 48,
    d: 'M 2.4 2.3 C 7.5 0.0 22.5 0.0 27.6 2.3 C 30.0 14.7 28.5 25.3 26.4 31.3 C 24.0 37.7 21.0 46.0 15.0 46.0 C 9.0 46.0 6.0 37.7 3.6 31.3 C 1.5 25.3 0.0 14.7 2.4 2.3 Z',
  },
  incisivo: {
    l: 30,
    a: 48,
    d: 'M 2.2 2.3 C 7.0 0.0 21.0 0.0 25.8 2.3 C 28.0 14.7 26.6 25.3 24.6 31.3 C 22.4 37.7 19.6 46.0 14.0 46.0 C 8.4 46.0 5.6 37.7 3.4 31.3 C 1.4 25.3 0.0 14.7 2.2 2.3 Z',
  },
};

/** Silhueta de um dente, pintada pela situação. */
export function Dente({ numero, situacao }: { numero: number; situacao: Situacao }) {
  const f = FORMAS[formaDoDente(numero)];
  const cor = situacao ? COR_SITUACAO[situacao] : { fundo: '#FFFFFF', borda: '#CFCBC0' };
  return (
    <svg
      width={f.l}
      height={f.a}
      viewBox={`0 0 ${f.l} ${f.a}`}
      aria-hidden="true"
      data-situacao={situacao ?? 'sem-registro'}
      style={{ maxWidth: '100%', transform: superior(numero) ? 'scaleY(-1)' : undefined }}
    >
      <g transform="translate(1 1)">
        <path
          d={f.d}
          fill={cor.fundo}
          stroke={cor.borda}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
