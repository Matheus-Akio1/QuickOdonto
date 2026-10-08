import type { ButtonHTMLAttributes } from 'react';

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  pequeno?: boolean;
  carregando?: boolean;
}

const CLASSE: Record<Variante, string> = {
  primary: '',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export function Button({
  variante = 'primary',
  pequeno,
  carregando,
  className = '',
  children,
  disabled,
  type = 'button',
  ...resto
}: Props) {
  const classes = ['btn', CLASSE[variante], pequeno ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...resto} type={type} className={classes} disabled={disabled || carregando}>
      {carregando ? 'Aguarde…' : children}
    </button>
  );
}
