import type { Face, StatusProcedimento } from '../../api/types';
import { facesNaTela } from '../../lib/odonto';

export type EstadoFace = Exclude<StatusProcedimento, 'cancelado'> | 'selecionada' | null;

interface Props {
  numero: number;
  estados: Partial<Record<Face, EstadoFace>>;
  /** Procedimento no dente inteiro (sem face), ex.: extração, canal. */
  estadoDente?: EstadoFace;
  tamanho?: number;
  onFace?: (face: Face) => void;
}

// Geometria em 40×40: quatro trapézios nas bordas e um quadrado no centro.
const POLIGONOS = {
  topo: '0,0 40,0 28,12 12,12',
  base: '0,40 40,40 28,28 12,28',
  esquerda: '0,0 12,12 12,28 0,40',
  direita: '40,0 28,12 28,28 40,40',
} as const;

const classe = (e: EstadoFace | undefined) => (e ? `face face-${e}` : 'face');

/** Desenho de um dente (vista oclusal). Com onFace, as faces viram alvos de clique. */
export function Dente({ numero, estados, estadoDente, tamanho = 40, onFace }: Props) {
  const pos = facesNaTela(numero);
  const interativo = Boolean(onFace);
  const faceEl = (lugar: keyof typeof POLIGONOS) => {
    const f = pos[lugar];
    return (
      <polygon
        key={lugar}
        points={POLIGONOS[lugar]}
        className={classe(estados[f])}
        onClick={interativo ? () => onFace?.(f) : undefined}
        style={interativo ? { cursor: 'pointer' } : undefined}
      >
        <title>{f}</title>
      </polygon>
    );
  };
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="-2 -2 44 44"
      aria-hidden="true"
      className={`dente-svg ${estadoDente ? `dente-${estadoDente}` : ''}`}
    >
      {(['topo', 'base', 'esquerda', 'direita'] as const).map(faceEl)}
      <rect
        x="12"
        y="12"
        width="16"
        height="16"
        className={classe(estados[pos.centro])}
        onClick={interativo ? () => onFace?.(pos.centro) : undefined}
        style={interativo ? { cursor: 'pointer' } : undefined}
      >
        <title>{pos.centro}</title>
      </rect>
      <rect x="-1" y="-1" width="42" height="42" className="contorno" />
    </svg>
  );
}
