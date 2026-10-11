import type { ButtonHTMLAttributes } from 'react';

/** Variantes do protótipo: primária (.pri), contorno (padrão), menta (.sec) + fantasma e perigo do app. */
type Variante = 'primary' | 'secondary' | 'mint' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  pequeno?: boolean;
  carregando?: boolean;
}

const CLASSE: Record<Variante, string> = {
  primary: 'pri',
  secondary: '',
  mint: 'sec',
  ghost: 'ghost',
  danger: 'danger',
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
  const classes = ['btn', CLASSE[variante], pequeno ? 'sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...resto} type={type} className={classes} disabled={disabled || carregando}>
      {carregando ? 'Aguarde…' : children}
    </button>
  );
}
