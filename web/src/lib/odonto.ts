import type { Face } from '../api/types';

/**
 * Numeração FDI na ordem em que o dentista vê a boca de frente para o paciente:
 * o lado direito do paciente (quadrantes 1 e 4) fica à esquerda da tela.
 */
export const ARCADAS = {
  permanente: {
    superior: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
    inferior: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
  },
  deciduo: {
    superior: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
    inferior: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
  },
} as const;

export const NOME_FACE: Record<Face, string> = {
  V: 'Vestibular',
  L: 'Lingual/palatina',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal',
  I: 'Incisal',
};

const quadrante = (dente: number) => Math.floor(dente / 10);

/** Incisivos e caninos têm borda incisal; pré-molares e molares, face oclusal. */
export const anterior = (dente: number) => dente % 10 <= 3;
export const faceCentral = (dente: number): Face => (anterior(dente) ? 'I' : 'O');

/** Superior: V em cima, L embaixo. Inferior: invertido (como no exame clínico). */
export const superior = (dente: number) => [1, 2, 5, 6].includes(quadrante(dente));

/**
 * Lado da mesial na tela: ela aponta para a linha média. Quadrantes do lado direito do
 * paciente (1, 4, 5, 8) aparecem à esquerda da tela, então a mesial fica à direita.
 */
export const mesialADireita = (dente: number) => [1, 4, 5, 8].includes(quadrante(dente));

/** Faces na posição em que aparecem no desenho do dente. */
export function facesNaTela(dente: number): {
  topo: Face;
  base: Face;
  esquerda: Face;
  direita: Face;
  centro: Face;
} {
  const sup = superior(dente);
  const mesDir = mesialADireita(dente);
  return {
    topo: sup ? 'V' : 'L',
    base: sup ? 'L' : 'V',
    esquerda: mesDir ? 'D' : 'M',
    direita: mesDir ? 'M' : 'D',
    centro: faceCentral(dente),
  };
}

/** Faces válidas para o dente (O só em posteriores, I só em anteriores). */
export const facesDoDente = (dente: number): Face[] => ['V', 'L', 'M', 'D', faceCentral(dente)];

export type FormaDente = 'molar' | 'premolar' | 'canino' | 'incisivo';

/** Silhueta usada no odontograma. Decíduos (quadrantes 5–8) não têm pré-molares: 4 e 5 são molares. */
export function formaDoDente(dente: number): FormaDente {
  const u = dente % 10;
  const deciduo = quadrante(dente) >= 5;
  if (u >= (deciduo ? 4 : 6)) return 'molar';
  if (u >= 4) return 'premolar';
  return u === 2 ? 'incisivo' : 'canino';
}

const TIPO: Record<number, string> = {
  1: 'incisivo central',
  2: 'incisivo lateral',
  3: 'canino',
  4: 'pré-molar',
  5: 'pré-molar',
  6: 'molar',
  7: 'molar',
  8: 'molar',
};

/** "pré-molar superior", "molar decíduo inferior"… */
export function nomeDoDente(dente: number): string {
  const u = dente % 10;
  const deciduo = quadrante(dente) >= 5;
  const tipo = deciduo && u >= 4 ? 'molar' : TIPO[u];
  return `${tipo}${deciduo ? ' decíduo' : ''} ${superior(dente) ? 'superior' : 'inferior'}`;
}

/** Como o dente aparece no odontograma (legenda da prancha "Prontuário"). */
export type Situacao = 'realizado' | 'planejado' | 'protese' | null;

export const COR_SITUACAO: Record<Exclude<Situacao, null>, { fundo: string; borda: string }> = {
  realizado: { fundo: '#DEF3E7', borda: '#3E9A6B' },
  planejado: { fundo: '#E2EDFB', borda: '#5D86D6' },
  protese: { fundo: '#ECE8FB', borda: '#8C74D6' },
};
