/** Iniciais como no protótipo: as duas primeiras palavras, sem o título ("Dra. Camila Nogueira" → "CN"). */
export function iniciais(nome: string): string {
  const p = nome
    .replace(/^(dra?\.?|sr\.?|sra\.?)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p[1]?.[0] ?? '')).toUpperCase();
}

const TONS = ['', 'c', 'i', 's'] as const;

/** Tom estável por nome (menta, laranja, violeta, azul). */
export function tomDoNome(nome: string): (typeof TONS)[number] {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONS[h % TONS.length];
}

/** Idade em anos completos a partir de 'AAAA-MM-DD'. */
export function idade(nascimento: string | null | undefined, hoje = new Date()): number | null {
  if (!nascimento) return null;
  const [a, m, d] = nascimento.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos -= 1;
  return anos;
}

/** Número de prontuário com cinco dígitos, como no protótipo (00482). */
export const prontuario5 = (n: number) => String(n).padStart(5, '0');
