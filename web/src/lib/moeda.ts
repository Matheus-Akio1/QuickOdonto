const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtMoeda = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : BRL.format(v);

/** Idade em anos completos a partir de 'AAAA-MM-DD'. */
export function idade(nascimento: string | null | undefined, hoje = new Date()): number | null {
  if (!nascimento) return null;
  const [a, m, d] = nascimento.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos -= 1;
  return anos;
}
