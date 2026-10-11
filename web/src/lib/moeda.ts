const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtMoeda = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : BRL.format(v);

export { idade } from './pessoa';
