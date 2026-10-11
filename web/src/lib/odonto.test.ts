import { ARCADAS, facesDoDente, facesNaTela } from './odonto';
import { fmtMoeda, idade } from './moeda';

describe('odontograma FDI', () => {
  it('tem 32 permanentes e 20 decíduos, sem repetição', () => {
    const p = [...ARCADAS.permanente.superior, ...ARCADAS.permanente.inferior];
    const d = [...ARCADAS.deciduo.superior, ...ARCADAS.deciduo.inferior];
    expect(new Set(p).size).toBe(32);
    expect(new Set(d).size).toBe(20);
  });

  it('mesial aponta para a linha média e V/L seguem a arcada', () => {
    expect(facesNaTela(16)).toEqual({
      topo: 'V',
      base: 'L',
      esquerda: 'D',
      direita: 'M',
      centro: 'O',
    });
    expect(facesNaTela(21)).toEqual({
      topo: 'V',
      base: 'L',
      esquerda: 'M',
      direita: 'D',
      centro: 'I',
    });
    expect(facesNaTela(36)).toEqual({
      topo: 'L',
      base: 'V',
      esquerda: 'M',
      direita: 'D',
      centro: 'O',
    });
    expect(facesNaTela(43)).toEqual({
      topo: 'L',
      base: 'V',
      esquerda: 'D',
      direita: 'M',
      centro: 'I',
    });
    expect(facesNaTela(55).direita).toBe('M');
  });

  it('anteriores têm incisal; posteriores, oclusal', () => {
    expect(facesDoDente(11)).toContain('I');
    expect(facesDoDente(11)).not.toContain('O');
    expect(facesDoDente(46)).toContain('O');
  });
});

describe('moeda e idade', () => {
  it('formata reais e calcula idade em anos completos', () => {
    expect(fmtMoeda(220).replace(/\s/g, ' ')).toBe('R$ 220,00');
    expect(fmtMoeda(null)).toBe('—');
    expect(idade('1990-10-12', new Date(2026, 9, 11))).toBe(35);
    expect(idade('1990-10-11', new Date(2026, 9, 11))).toBe(36);
  });
});
