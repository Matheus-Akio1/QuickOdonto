import { distribuirEmFaixas, lacunas } from './agendaLayout';

const ev = (id: string, inicio: number, fim: number) => ({ id, inicio, fim });

describe('distribuirEmFaixas', () => {
  it('item isolado ocupa a largura toda', () => {
    const [a] = distribuirEmFaixas([ev('a', 540, 570)]);
    expect([a.faixa, a.faixas]).toEqual([0, 1]);
  });

  it('itens sobrepostos dividem a largura; vizinhos (fim = início) não', () => {
    const r = distribuirEmFaixas([ev('a', 540, 600), ev('b', 570, 630), ev('c', 630, 660)]);
    const por = Object.fromEntries(r.map((x) => [x.item.id, [x.faixa, x.faixas]]));
    expect(por.a).toEqual([0, 2]);
    expect(por.b).toEqual([1, 2]);
    expect(por.c).toEqual([0, 1]);
  });

  it('reaproveita faixa livre dentro do mesmo grupo', () => {
    const r = distribuirEmFaixas([ev('a', 540, 720), ev('b', 540, 570), ev('c', 570, 600)]);
    const por = Object.fromEntries(r.map((x) => [x.item.id, x.faixa]));
    expect(por.b).toBe(por.c);
    expect(por.a).not.toBe(por.b);
    expect(r.every((x) => x.faixas === 2)).toBe(true);
  });
});

describe('lacunas (fora da jornada)', () => {
  it('devolve o que a jornada não cobre', () => {
    const l = lacunas(
      [
        { inicio: 480, fim: 720 },
        { inicio: 840, fim: 1080 },
      ],
      420,
      1140,
    );
    expect(l).toEqual([
      { inicio: 420, fim: 480 },
      { inicio: 720, fim: 840 },
      { inicio: 1080, fim: 1140 },
    ]);
  });

  it('dia sem jornada fica todo hachurado', () => {
    expect(lacunas([], 420, 1140)).toEqual([{ inicio: 420, fim: 1140 }]);
  });
});
