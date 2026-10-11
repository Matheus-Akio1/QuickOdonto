import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  ativo?: boolean;
}

/** Chip de filtro do protótipo (.chip / .chip.on). */
export function Chip({ ativo, className = '', children, ...resto }: Props) {
  return (
    <button
      {...resto}
      type="button"
      className={`chip ${ativo ? 'on' : ''} ${className}`}
      aria-pressed={ativo}
    >
      {children}
    </button>
  );
}
