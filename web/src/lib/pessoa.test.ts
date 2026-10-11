import { idade, iniciais, tomDoNome } from './pessoa';

describe('pessoa', () => {
  it('iniciais seguem o protótipo: duas primeiras palavras, sem título', () => {
    expect(iniciais('Ana Beatriz Souza')).toBe('AB');
    expect(iniciais('Dra. Camila Nogueira')).toBe('CN');
    expect(iniciais('Dr. Felipe Andrade')).toBe('FA');
    expect(iniciais('Madonna')).toBe('M');
    expect(iniciais('  ')).toBe('?');
  });

  it('o tom do avatar é estável para o mesmo nome', () => {
    expect(tomDoNome('Ana Beatriz Souza')).toBe(tomDoNome('Ana Beatriz Souza'));
    expect(['', 'c', 'i', 's']).toContain(tomDoNome('Qualquer Nome'));
  });

  it('idade em anos completos', () => {
    expect(idade('1990-10-12', new Date(2026, 9, 11))).toBe(35);
    expect(idade('1990-10-11', new Date(2026, 9, 11))).toBe(36);
    expect(idade(null)).toBeNull();
  });
});
