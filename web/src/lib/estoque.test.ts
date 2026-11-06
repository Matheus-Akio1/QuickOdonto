import type { Produto } from '../api/types';
import { descricaoDoProduto, fmtQtd, larguraDaBarra, lerQuantidade } from './estoque';

const produto = (extra: Partial<Produto>): Produto => ({
  id: '1',
  nome: 'Gesso especial tipo IV',
  codigo: 'G4-0825',
  categoria: 'Gessos',
  unidade_medida: 'kg',
  estoque_minimo: 10,
  ativo: true,
  saldo: 18,
  situacao: 'normal',
  lotes: [],
  ...extra,
});

describe('estoque — textos e barra das pranchas', () => {
  it('formata quantidades em pt-BR', () => {
    expect(fmtQtd(1000, 'g')).toBe('1.000 g');
    expect(fmtQtd(0.5, 'L')).toBe('0,5 L');
    expect(fmtQtd(18)).toBe('18');
  });

  it('a barra enche no dobro do mínimo (marcador no meio)', () => {
    expect(larguraDaBarra(18, 10)).toBe(90);
    expect(larguraDaBarra(450, 1000)).toBe(23);
    expect(larguraDaBarra(50, 10)).toBe(100);
    expect(larguraDaBarra(0, 10)).toBe(0);
    expect(larguraDaBarra(3, 0)).toBe(100);
  });

  it('descreve o produto com validade curta ou completa conforme a urgência', () => {
    expect(descricaoDoProduto(produto({ proxima_validade: '2027-03-15' }))).toBe(
      'Gessos · G4-0825 · val. 03/2027',
    );
    expect(
      descricaoDoProduto(produto({ proxima_validade: '2026-10-28', situacao: 'vencendo' })),
    ).toBe('Gessos · G4-0825 · val. 28/10/2026');
    expect(descricaoDoProduto(produto({ categoria: null }))).toBe('G4-0825');
  });

  it('lê quantidade digitada com vírgula ou ponto', () => {
    expect(lerQuantidade('40')).toBe(40);
    expect(lerQuantidade('1.000,5')).toBe(1000.5);
    expect(lerQuantidade('0.25')).toBe(0.25);
    expect(lerQuantidade('')).toBeNull();
    expect(lerQuantidade('abc')).toBeNull();
    expect(lerQuantidade('-3')).toBeNull();
  });
});
