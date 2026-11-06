import type { Lancamento } from '../api/types';
import {
  detalheLancamento,
  lerValor,
  moverPeriodo,
  periodoDe,
  seloLancamento,
  tetoDoEixo,
} from './financeiro';

const base: Lancamento = {
  id: '1',
  tipo: 'receita',
  descricao: 'Juliana Martins',
  valor: 850,
  valor_pago: 0,
  saldo: 850,
  vencimento: '2026-10-16',
  situacao: 'aberto',
  atrasado: false,
  categoria: { id: 'c', nome: 'Tratamento' },
  criado_em: '2026-10-01T12:00:00.000Z',
};
const l = (extra: Partial<Lancamento>): Lancamento => ({ ...base, ...extra });

describe('financeiro — período do fluxo de caixa', () => {
  it('mês, semana e dia a partir da data de referência', () => {
    expect(periodoDe('mes', '2026-02-10')).toEqual({
      inicio: '2026-02-01',
      fim: '2026-02-28',
      rotulo: 'Fevereiro 2026',
    });
    expect(periodoDe('mes', '2024-02-29').fim).toBe('2024-02-29');
    expect(periodoDe('semana', '2026-10-14')).toEqual({
      inicio: '2026-10-12',
      fim: '2026-10-18',
      rotulo: '12/10 a 18/10',
    });
    expect(periodoDe('hoje', '2026-10-14')).toMatchObject({
      inicio: '2026-10-14',
      fim: '2026-10-14',
    });
  });

  it('anda um passo por vez, inclusive na virada do ano', () => {
    expect(moverPeriodo('mes', '2026-12-15', 1)).toBe('2027-01-01');
    expect(moverPeriodo('mes', '2026-01-31', -1)).toBe('2025-12-01');
    expect(moverPeriodo('semana', '2026-10-14', -1)).toBe('2026-10-07');
    expect(moverPeriodo('hoje', '2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('financeiro — textos das pranchas', () => {
  it('selo da situação muda com o tipo e com o atraso', () => {
    expect(seloLancamento(base)).toEqual({ texto: 'A receber', classe: 'b-warn' });
    expect(seloLancamento(l({ tipo: 'despesa' })).texto).toBe('A pagar');
    expect(seloLancamento(l({ situacao: 'pago' }))).toEqual({ texto: 'Recebido', classe: 'b-ok' });
    expect(seloLancamento(l({ tipo: 'despesa', situacao: 'pago' }))).toEqual({
      texto: 'Pago',
      classe: 'b-mut',
    });
    expect(seloLancamento(l({ atrasado: true })).texto).toBe('Atrasado');
    expect(seloLancamento(l({ situacao: 'parcial' })).texto).toBe('Parcial');
    expect(seloLancamento(l({ situacao: 'cancelado', atrasado: true })).texto).toBe('Cancelado');
  });

  it('detalhe junta categoria, forma e parcela', () => {
    expect(detalheLancamento(l({ forma: 'pix' }))).toBe('Tratamento · Pix');
    expect(detalheLancamento(l({ parcela: 3, parcelas: 6 }))).toBe('Tratamento · parcela 3/6');
  });

  it('lê valores digitados em pt-BR e recusa o que não for dinheiro', () => {
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('R$ 850')).toBe(850);
    expect(lerValor('12.5')).toBe(12.5);
    expect(lerValor('0')).toBeNull();
    expect(lerValor('abc')).toBeNull();
    expect(lerValor('')).toBeNull();
  });

  it('eixo do gráfico sobe para um número redondo', () => {
    expect(tetoDoEixo(0)).toBe(1000);
    expect(tetoDoEixo(18400)).toBe(20000);
    expect(tetoDoEixo(4800)).toBe(5000);
    expect(tetoDoEixo(1000)).toBe(1000);
    expect(tetoDoEixo(310)).toBe(400);
  });
});
