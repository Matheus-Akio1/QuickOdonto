import type { ReactNode } from 'react';

interface Opcao<T extends string> {
  valor: T;
  rotulo: ReactNode;
}

interface Props<T extends string> {
  opcoes: Opcao<T>[];
  valor: T;
  onMudar: (v: T) => void;
  rotulo: string;
  pequeno?: boolean;
}

/** Controle segmentado do protótipo (.seg): escolha única entre poucas opções. */
export function Seg<T extends string>({ opcoes, valor, onMudar, rotulo, pequeno }: Props<T>) {
  return (
    <div className={`seg ${pequeno ? 'sm' : ''}`} role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={o.valor === valor ? 'on' : ''}
          aria-pressed={o.valor === valor}
          onClick={() => onMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
