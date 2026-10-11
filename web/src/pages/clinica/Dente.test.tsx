import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dente } from './Dente';

const clicarRegiao = (container: HTMLElement, face: string) => {
  const alvo = [...container.querySelectorAll('polygon, rect')].find(
    (el) => el.querySelector('title')?.textContent === face,
  );
  fireEvent.click(alvo!);
};

describe('desenho do dente', () => {
  it('cada região clicável corresponde à face anatômica certa (46: mesial à direita, oclusal no centro)', () => {
    const onFace = vi.fn();
    const { container } = render(<Dente numero={46} estados={{}} onFace={onFace} />);
    const titulos = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titulos.sort()).toEqual(['D', 'L', 'M', 'O', 'V']);
    clicarRegiao(container, 'M');
    clicarRegiao(container, 'O');
    expect(onFace.mock.calls.map((c) => c[0])).toEqual(['M', 'O']);
  });

  it('incisivo mostra a borda incisal no centro e pinta a face pelo estado', () => {
    const { container } = render(
      <Dente numero={11} estados={{ I: 'concluido', V: 'planejado' }} />,
    );
    const centro = container.querySelector('rect');
    expect(centro?.querySelector('title')?.textContent).toBe('I');
    expect(centro?.getAttribute('class')).toContain('face-concluido');
  });

  it('sem onFace o desenho não é interativo', () => {
    const { container } = render(<Dente numero={36} estados={{}} />);
    expect(
      [...container.querySelectorAll('polygon')].every((p) => !(p as SVGElement).style.cursor),
    ).toBe(true);
  });
});
