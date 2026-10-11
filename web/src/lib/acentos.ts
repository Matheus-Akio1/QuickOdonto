/**
 * "Acentos por contexto" do sistema visual: cada profissional recebe um acento fixo
 * (pela ordem na lista da clínica), usado na agenda, no quadro e nos selos.
 */
export interface Acento {
  forte: string;
  fundo: string;
  borda: string;
  texto: string;
}

export const ACENTOS: Acento[] = [
  { forte: '#0F6B63', fundo: '#DCEFEA', borda: '#9ACFC3', texto: '#0A4F49' }, // petróleo
  { forte: '#DE6B2F', fundo: '#FCE8D8', borda: '#F0BE96', texto: '#7A3209' }, // laranja
  { forte: '#6553D6', fundo: '#ECE8FB', borda: '#C9C0F3', texto: '#43339A' }, // violeta
  { forte: '#2F6FD0', fundo: '#E2EDFB', borda: '#B5CDF2', texto: '#1B438F' }, // azul
  { forte: '#C93E6B', fundo: '#FBE4EC', borda: '#F0B6C9', texto: '#86203F' }, // rosa
];

export function acentoPorIndice(i: number): Acento {
  return ACENTOS[((i % ACENTOS.length) + ACENTOS.length) % ACENTOS.length];
}

/** Mapa profissional → acento, estável enquanto a ordem da lista não mudar. */
export function mapaDeAcentos(profissionais: { id: string }[]): Record<string, Acento> {
  return Object.fromEntries(profissionais.map((p, i) => [p.id, acentoPorIndice(i)]));
}
