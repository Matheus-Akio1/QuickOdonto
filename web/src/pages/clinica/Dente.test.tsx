import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formaDoDente, nomeDoDente } from '../../lib/odonto';
import { Dente } from './Dente';

describe('silhueta do dente', () => {
  it('escolhe a forma pela posição (FDI), inclusive nos decíduos', () => {
    expect([18, 16, 15, 14, 13, 12, 11].map(formaDoDente)).toEqual([
      'molar',
      'molar',
      'premolar',
      'premolar',
      'canino',
      'incisivo',
      'canino',
    ]);
    expect([55, 54, 53, 52].map(formaDoDente)).toEqual(['molar', 'molar', 'canino', 'incisivo']);
  });

  it('descreve o dente como na barra de seleção', () => {
    expect(nomeDoDente(24)).toBe('pré-molar superior');
    expect(nomeDoDente(46)).toBe('molar inferior');
    expect(nomeDoDente(75)).toBe('molar decíduo inferior');
  });

  it('superior é espelhado e a cor segue a situação', () => {
    const sup = render(<Dente numero={24} situacao="planejado" />).container.querySelector('svg')!;
    expect(sup.style.transform).toBe('scaleY(-1)');
    expect(sup.querySelector('path')?.getAttribute('fill')).toBe('#E2EDFB');
    const inf = render(<Dente numero={46} situacao={null} />).container.querySelector('svg')!;
    expect(inf.style.transform).toBe('');
    expect(inf.querySelector('path')?.getAttribute('fill')).toBe('#FFFFFF');
  });
});
