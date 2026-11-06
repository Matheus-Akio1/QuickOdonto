import type { MotivoRetirada, Produto } from '../api/types';
import { fmtDataBR } from './datas';

const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** "1.000 g", "18 kg", "0,5 L" */
export const fmtQtd = (n: number, unidade?: string) =>
  `${NUM.format(n)}${unidade ? ` ${unidade}` : ''}`;

export const SITUACAO: Record<Produto['situacao'], { texto: string; classe: string; cor: string }> =
  {
    abaixo_minimo: { texto: 'Abaixo do mínimo', classe: 'b-bad', cor: '#D92D20' },
    vencido: { texto: 'Vencido', classe: 'b-bad', cor: '#D92D20' },
    vencendo: { texto: 'Vence em 30 dias', classe: 'b-warn', cor: '#DE6B2F' },
    normal: { texto: 'Normal', classe: 'b-ok', cor: '#12A150' },
  };

/**
 * Barra de saldo das pranchas: o marcador do mínimo fica no meio, então a barra cheia
 * representa o dobro do mínimo. Sem mínimo definido, qualquer saldo enche a barra.
 */
export function larguraDaBarra(saldo: number, minimo: number): number {
  if (minimo <= 0) return saldo > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((saldo / (2 * minimo)) * 100)));
}

/** "Gessos · G4-0825 · val. 03/2027" (dia/mês/ano quando a validade está próxima). */
export function descricaoDoProduto(p: Produto): string {
  const partes = [p.categoria, p.codigo].filter(Boolean) as string[];
  if (p.proxima_validade) {
    const [a, m] = p.proxima_validade.split('-');
    partes.push(
      `val. ${p.situacao === 'vencendo' || p.situacao === 'vencido' ? fmtDataBR(p.proxima_validade) : `${m}/${a}`}`,
    );
  }
  return partes.join(' · ');
}

export const MOTIVO: Record<MotivoRetirada, string> = {
  producao: 'Produção',
  uso: 'Uso',
  perda: 'Perda',
  refacao: 'Refação',
  vencimento: 'Vencimento',
};
/** Motivos oferecidos em cada unidade (a prancha do laboratório mostra Produção · Perda · Refação). */
export const MOTIVOS_DA_UNIDADE: Record<'clinica' | 'laboratorio', MotivoRetirada[]> = {
  laboratorio: ['producao', 'perda', 'refacao'],
  clinica: ['uso', 'perda', 'vencimento'],
};

/** Aceita "1.000,5" ou "1000.5"; devolve null se não for um número positivo. */
export function lerQuantidade(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}
