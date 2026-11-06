import type { FormaPagamento, Lancamento } from '../api/types';
import { fmtDataCurta, hoje, inicioDaSemana, somarDias } from './datas';

export const FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
};
export const FORMAS = Object.keys(FORMA) as FormaPagamento[];
/** Formas que aparecem no caixa do dia, na ordem da prancha. */
export const FORMAS_DO_CAIXA: FormaPagamento[] = ['pix', 'credito', 'debito', 'dinheiro'];

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export type ModoPeriodo = 'hoje' | 'semana' | 'mes';
export interface Periodo {
  inicio: string;
  fim: string;
  rotulo: string;
}

/** Último dia do mês de uma data 'AAAA-MM-DD'. */
function fimDoMes(data: string): string {
  const [a, m] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Período do fluxo de caixa a partir do modo e de uma data de referência. */
export function periodoDe(modo: ModoPeriodo, ancora: string): Periodo {
  if (modo === 'hoje') return { inicio: ancora, fim: ancora, rotulo: fmtDataCurta(ancora) };
  if (modo === 'semana') {
    const inicio = inicioDaSemana(ancora);
    const fim = somarDias(inicio, 6);
    return { inicio, fim, rotulo: `${fmtDataCurta(inicio)} a ${fmtDataCurta(fim)}` };
  }
  const inicio = `${ancora.slice(0, 8)}01`;
  const [a, m] = ancora.split('-').map(Number);
  return { inicio, fim: fimDoMes(ancora), rotulo: `${MESES[m - 1]} ${a}` };
}

/** Anda um passo para trás ou para frente no modo escolhido. */
export function moverPeriodo(modo: ModoPeriodo, ancora: string, delta: number): string {
  if (modo === 'hoje') return somarDias(ancora, delta);
  if (modo === 'semana') return somarDias(ancora, delta * 7);
  const [a, m] = ancora.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

export const mesDe = (data: string): string => data.slice(0, 7);
export const mesAtual = (): string => mesDe(hoje());

export interface SeloLancamento {
  texto: string;
  classe: 'b-ok' | 'b-warn' | 'b-bad' | 'b-mut';
}

/** Selo da coluna "Situação", como na prancha: Recebido · Pago · A receber · A pagar · Atrasado. */
export function seloLancamento(l: Lancamento): SeloLancamento {
  const receita = l.tipo === 'receita';
  if (l.situacao === 'cancelado') return { texto: 'Cancelado', classe: 'b-mut' };
  if (l.situacao === 'pago') {
    return receita ? { texto: 'Recebido', classe: 'b-ok' } : { texto: 'Pago', classe: 'b-mut' };
  }
  if (l.atrasado) return { texto: 'Atrasado', classe: 'b-bad' };
  if (l.situacao === 'parcial') return { texto: 'Parcial', classe: 'b-warn' };
  return { texto: receita ? 'A receber' : 'A pagar', classe: 'b-warn' };
}

/** "Tratamento · Pix" — categoria e forma, com a parcela quando houver. */
export function detalheLancamento(l: Lancamento): string {
  return [
    l.categoria.nome,
    l.forma ? FORMA[l.forma] : null,
    l.parcela ? `parcela ${l.parcela}/${l.parcelas}` : null,
    l.recorrencia ? 'mensal' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Data que identifica o lançamento na lista: a do pagamento, se quitado; senão o vencimento. */
export const dataDoLancamento = (l: Lancamento): string => l.pagamento ?? l.vencimento;

/** Aceita "1.234,56" ou "1234.56"; devolve null se não for um valor positivo com até 2 casas. */
export function lerValor(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Topo do eixo do gráfico: o próximo "número redondo" acima do maior valor. */
export function tetoDoEixo(maior: number): number {
  if (maior <= 0) return 1000;
  const grandeza = 10 ** Math.floor(Math.log10(maior));
  for (const m of [1, 2, 4, 5, 8, 10]) if (maior <= m * grandeza) return m * grandeza;
  return 10 * grandeza;
}
